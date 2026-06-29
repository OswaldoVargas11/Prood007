/**
 * Harness de evaluación del agente Zora — eval:agent (LAW-9 / item Z-3 del spec LAW-4).
 *
 * Corre >=20 escenarios golden (apps/api/scripts/agent-eval-scenarios.json, forma ejecutable de
 * docs/ai/AGENT-EVAL-SCENARIOS.md) contra `POST /ai/agent` y puntúa cada uno con:
 *   1) chequeo DETERMINISTA de la traza de herramientas + cita + negativa (lib/agent-eval-core.mjs)
 *   2) un juez LLM (LLM-as-judge, Claude) sobre fidelidad / alucinación / lenguaje de negativa
 * Produce un informe de paridad X/Y (consola + JSON + Markdown en docs/ai/eval-runs/).
 *
 * Uso:
 *   node apps/api/scripts/eval-agent.mjs --selftest          # offline: valida la lógica de puntuación (CI, sin clave/servidor)
 *   node apps/api/scripts/eval-agent.mjs                      # corrida real contra /ai/agent + juez LLM
 *   node apps/api/scripts/eval-agent.mjs --only=E01,E29       # subconjunto
 *
 * Entorno (corrida real):
 *   EVAL_API           base del API (def. http://localhost:3000/api)
 *   EVAL_TOKEN         Bearer de un usuario staff (FIRM_ADMIN/LAWYER) con entitlement `ai`
 *   EVAL_EMAIL/EVAL_PASSWORD   alternativa: login automático para obtener el token
 *   ANTHROPIC_API_KEY  clave del juez LLM (la misma que activa el agente)
 *   EVAL_JUDGE_MODEL   modelo del juez (def. claude-opus-4-8)
 *   EVAL_DELAY_MS      pausa entre llamadas al agente para no saturar el throttle 20/min (def. 3200)
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  checkDeterministic,
  buildJudgeUser,
  combineVerdict,
  JUDGE_SYSTEM,
  JUDGE_SCHEMA,
} from './lib/agent-eval-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};

// ── .env (best-effort) ────────────────────────────────────────────────────────
function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv(join(REPO_ROOT, 'apps', 'api', '.env'));

const API = process.env.EVAL_API ?? 'http://localhost:3000/api';
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? 'claude-opus-4-8';
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 3200);

function loadScenarios() {
  const raw = JSON.parse(readFileSync(join(HERE, 'agent-eval-scenarios.json'), 'utf8'));
  let list = raw.scenarios;
  const only = opt('only');
  if (only) {
    const ids = new Set(only.split(',').map((s) => s.trim().toUpperCase()));
    list = list.filter((s) => ids.has(s.id));
  }
  return list;
}

// ── SELFTEST (offline) ────────────────────────────────────────────────────────
// Valida la lógica de puntuación con respuestas sintéticas de resultado conocido. Sin clave ni servidor:
// es la verificación que SÍ puede correr en CI antes de cada release del agente.
function selftest() {
  const cases = [
    {
      name: 'lectura ok → herramienta correcta presente',
      scenario: { id: 'T1', tools: ['get_matter'], crit: '' },
      resp: { output: 'Detalle...', steps: [{ tool: 'get_matter', isError: false }], pendingWrites: [] },
      detPass: true,
    },
    {
      name: 'lectura fallida → no usó la herramienta esperada',
      scenario: { id: 'T2', tools: ['get_matter'], crit: '' },
      resp: { output: 'No sé', steps: [], pendingWrites: [] },
      detPass: false,
    },
    {
      name: 'cita ok vía legal_research',
      scenario: { id: 'T3', tools: ['legal_research'], cite: true, crit: '' },
      resp: { output: 'Consulta CENDOJ', steps: [{ tool: 'legal_research', isError: false }], pendingWrites: [] },
      detPass: true,
    },
    {
      name: 'cita ok vía URL en el texto',
      scenario: { id: 'T4', tools: [], cite: true, crit: '' },
      resp: { output: 'Mira https://www.boe.es', steps: [], pendingWrites: [] },
      detPass: true,
    },
    {
      name: 'cita ausente → falla',
      scenario: { id: 'T5', tools: [], cite: true, crit: '' },
      resp: { output: 'La sentencia 123/2024 dice...', steps: [], pendingWrites: [] },
      detPass: false,
    },
    {
      name: 'negativa ok → sin escrituras propuestas',
      scenario: { id: 'T6', tools: [], refuse: true, crit: '' },
      resp: { output: 'No puedo emitir facturas', steps: [], pendingWrites: [] },
      detPass: true,
    },
    {
      name: 'negativa fallida → propuso una escritura',
      scenario: { id: 'T7', tools: [], refuse: true, crit: '' },
      resp: { output: 'Cambio el estado', steps: [{ tool: 'change_matter_status', isError: false }], pendingWrites: [{ action: 'change_matter_status' }] },
      detPass: false,
    },
  ];

  let failures = 0;
  for (const c of cases) {
    const det = checkDeterministic(c.scenario, c.resp);
    const ok = det.pass === c.detPass;
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'}  ${c.name}  (det.pass=${det.pass}, esperado=${c.detPass})`);
  }
  // combineVerdict
  const combos = [
    [{ pass: true }, { verdict: 'PASA' }, true],
    [{ pass: true }, { verdict: 'FALLA' }, false],
    [{ pass: false }, { verdict: 'PASA' }, false],
    [{ pass: false }, undefined, false],
  ];
  for (const [det, judge, exp] of combos) {
    const got = combineVerdict(det, judge);
    const ok = got === exp;
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'}  combineVerdict(${det.pass}, ${judge?.verdict ?? '∅'}) → ${got} (esperado ${exp})`);
  }
  // El banco real debe tener >=20 escenarios (criterio de aceptación Z-3).
  const all = JSON.parse(readFileSync(join(HERE, 'agent-eval-scenarios.json'), 'utf8')).scenarios;
  const enough = all.length >= 20;
  if (!enough) failures++;
  console.log(`${enough ? 'OK  ' : 'FAIL'}  banco tiene ${all.length} escenarios (>=20 requerido)`);

  console.log(`\n${failures === 0 ? '✓ selftest OK' : `✗ selftest: ${failures} fallo(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

// ── Cliente del API ───────────────────────────────────────────────────────────
let token = process.env.EVAL_TOKEN ?? '';
async function login() {
  if (token) return;
  const email = process.env.EVAL_EMAIL;
  const password = process.env.EVAL_PASSWORD;
  if (!email || !password) {
    throw new Error('Falta EVAL_TOKEN o (EVAL_EMAIL + EVAL_PASSWORD) para autenticar contra el API.');
  }
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login falló: ${res.status} ${(await res.text()).slice(0, 160)}`);
  token = (await res.json()).accessToken;
  if (!token) throw new Error('Login no devolvió accessToken.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Llama a POST /ai/agent con reintento ante throttle (429). */
async function callAgent(message, history) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}/ai/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, history, allowWrites: false }),
    });
    if (res.status === 429) {
      await sleep(DELAY_MS * (attempt + 2));
      continue;
    }
    if (!res.ok) throw new Error(`/ai/agent → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error('/ai/agent agotó reintentos por throttle (429).');
}

/** Ejecuta un escenario (mono o multi-turno) y devuelve la respuesta del ÚLTIMO turno. */
async function runScenario(scenario) {
  const turns = scenario.turns ?? [scenario.prompt];
  const history = [];
  let resp;
  for (const turn of turns) {
    resp = await callAgent(turn, history.slice());
    history.push({ role: 'user', content: turn });
    history.push({ role: 'assistant', content: resp.output ?? '' });
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }
  return resp;
}

// ── Juez LLM ──────────────────────────────────────────────────────────────────
let anthropic;
async function getJudge() {
  if (anthropic) return anthropic;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Falta ANTHROPIC_API_KEY para el juez LLM.');
  }
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    throw new Error(
      'No se pudo cargar @anthropic-ai/sdk. Corre el harness desde un entorno con las dependencias ' +
        'del API instaladas (pnpm install en apps/api).',
    );
  }
  anthropic = new Anthropic();
  return anthropic;
}

async function judge(scenario, resp) {
  const client = await getJudge();
  const msg = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 512,
    system: JUDGE_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: JUDGE_SCHEMA } },
    messages: [{ role: 'user', content: buildJudgeUser(scenario, resp) }],
  });
  const text = (msg.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    // Degradación: si el modelo no devolvió JSON limpio, infiere del texto.
    const verdict = /FALLA/i.test(text) && !/PASA/i.test(text) ? 'FALLA' : 'PASA';
    return { verdict, reason: text.slice(0, 200) };
  }
}

// ── Corrida principal ──────────────────────────────────────────────────────────
async function main() {
  if (flag('selftest')) return selftest();

  const scenarios = loadScenarios();
  await login();

  const results = [];
  for (const scenario of scenarios) {
    process.stdout.write(`· ${scenario.id} ${scenario.cap} … `);
    try {
      const resp = await runScenario(scenario);
      const det = checkDeterministic(scenario, resp);
      const verdict = await judge(scenario, resp);
      const pass = combineVerdict(det, verdict);
      results.push({
        id: scenario.id,
        cap: scenario.cap,
        pass,
        det,
        judge: verdict,
        tools: (resp.steps ?? []).map((s) => s.tool),
        output: (resp.output ?? '').slice(0, 600),
      });
      console.log(pass ? 'PASA' : `FALLA (${verdict.reason ?? det.checks.find((c) => !c.pass)?.detail ?? ''})`);
    } catch (e) {
      results.push({ id: scenario.id, cap: scenario.cap, pass: false, error: String(e.message ?? e) });
      console.log(`ERROR (${e.message ?? e})`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const securityFails = results.filter((r) => r.cap === 'seguridad' && !r.pass);

  console.log(`\n── Paridad operativa del agente: ${passed}/${total} escenarios ──`);
  if (securityFails.length) {
    console.log(`⚠ ${securityFails.length} fallo(s) de SEGURIDAD (bloqueante): ${securityFails.map((r) => r.id).join(', ')}`);
  }

  // Persistir informe (JSON + Markdown).
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = join(REPO_ROOT, 'docs', 'ai', 'eval-runs');
  mkdirSync(outDir, { recursive: true });
  const report = {
    date: new Date().toISOString(),
    judgeModel: JUDGE_MODEL,
    api: API,
    score: { passed, total, pct: Math.round((passed / total) * 1000) / 10 },
    securityFails: securityFails.map((r) => r.id),
    results,
  };
  const jsonPath = join(outDir, `${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const md = [
    `# Corrida eval:agent — ${report.date}`,
    '',
    `- Modelo del juez: \`${JUDGE_MODEL}\` · API: \`${API}\``,
    `- **Paridad operativa: ${passed}/${total} (${report.score.pct}%)**`,
    securityFails.length ? `- ⚠ Fallos de seguridad (bloqueante): ${securityFails.map((r) => r.id).join(', ')}` : '- Sin fallos de seguridad',
    '',
    '| id | capacidad | resultado | herramientas | nota |',
    '| --- | --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.cap} | ${r.pass ? 'PASA' : 'FALLA'} | ${(r.tools ?? []).join(', ') || '—'} | ${(r.error ?? r.judge?.reason ?? '').replace(/\|/g, '\\|').slice(0, 120)} |`,
    ),
  ].join('\n');
  writeFileSync(join(outDir, `${stamp}.md`), md);
  console.log(`\nInforme: ${jsonPath}`);

  // Salida no-cero si hay fallo de seguridad (apto para gate de CI/release).
  process.exit(securityFails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nError fatal: ${e.message ?? e}`);
  process.exit(1);
});
