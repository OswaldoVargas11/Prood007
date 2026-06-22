import { readFileSync } from 'node:fs';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { CREDS_PATH, type SeedCreds } from './global-setup';

const creds = (): SeedCreds => JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as SeedCreds;
const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';

// ── Generadores de identificadores VÁLIDOS (con dígito de control). Cada llamada usa una semilla
//    única para no chocar con documentos ya existentes (idempotente ante reintentos). ────────────
let seedCounter = Math.floor(process.hrtime()[1] % 9_000_000) + 1_000_000;
const nextSeed = () => seedCounter++;
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const nif = (n: number) => `${String(n).padStart(8, '0').slice(0, 8)}${NIF_LETTERS[n % 23]}`;
function cif(seed: number): string {
  const d = String(seed).padStart(7, '0').slice(0, 7);
  let odd = 0,
    even = 0;
  for (let i = 0; i < 7; i++) {
    const n = Number(d[i]);
    if (i % 2 === 0) {
      const x = n * 2;
      odd += x > 9 ? Math.floor(x / 10) + (x % 10) : x;
    } else even += n;
  }
  const unit = (odd + even) % 10;
  return `B${d}${unit === 0 ? 0 : 10 - unit}`;
}
const RNC_W = [7, 9, 8, 6, 5, 4, 3, 2];
function rnc(seed: number): string {
  const d = String(seed).padStart(8, '0').slice(0, 8);
  let s = 0;
  for (let i = 0; i < 8; i++) s += Number(d[i]) * RNC_W[i];
  const m = s % 11;
  return d + String(m === 0 ? 2 : m === 1 ? 1 : 11 - m);
}
function cedula(seed: number): string {
  const d = String(seed).padStart(10, '0').slice(0, 10);
  let s = 0;
  for (let i = 0; i < 10; i++) {
    let p = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (p > 9) p -= 9;
    s += p;
  }
  return d + String((10 - (s % 10)) % 10);
}

async function createClient(req: APIRequestContext, tok: string, taxId: string) {
  const res = await req.post(`${API}/api/clients`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: { name: `C-${nextSeed()}`, taxId },
  });
  let body: { taxIdKind?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* noop */
  }
  return { status: res.status(), kind: body.taxIdKind };
}

/**
 * Validación de identificador fiscal con dígito de control, por jurisdicción, con reintento dual.
 * Los documentos válidos se generan con su algoritmo de control y semilla única por llamada.
 */
test.describe('Validación de NIF/CIF/RNC/Cédula', () => {
  test('despacho ES: acepta NIF/CIF válidos, rechaza inválidos y basura, reintenta RNC (dual)', async ({
    request,
  }) => {
    const tok = creds().tokens.admin;

    expect(await createClient(request, tok, nif(nextSeed())), 'NIF válido').toMatchObject({
      status: 201,
      kind: 'NIF',
    });
    expect(await createClient(request, tok, cif(nextSeed())), 'CIF válido').toMatchObject({
      status: 201,
      kind: 'CIF',
    });
    // Letra de control incorrecta → 400 de dominio (no 500). Forzamos una letra mala manteniendo el número.
    const badNif = nif(nextSeed());
    const wrongLetter = NIF_LETTERS[(NIF_LETTERS.indexOf(badNif.slice(-1)) + 1) % 23];
    expect(
      (await createClient(request, tok, badNif.slice(0, 8) + wrongLetter)).status,
      'NIF letra mala',
    ).toBe(400);
    // Formato basura / vacío → 400 de validación de entrada.
    expect((await createClient(request, tok, 'HOLA')).status, 'basura').toBe(400);
    expect((await createClient(request, tok, '')).status, 'vacío').toBe(400);
    // Reintento dual: un RNC dominicano válido se acepta en un despacho ES.
    expect(await createClient(request, tok, rnc(nextSeed())), 'RNC en ES (dual)').toMatchObject({
      status: 201,
      kind: 'RNC',
    });
  });

  test('despacho DO: acepta RNC/Cédula válidos, rechaza inválidos, reintenta NIF (dual)', async ({
    request,
  }) => {
    const tok = creds().tokens.doAdmin;

    expect(await createClient(request, tok, rnc(nextSeed())), 'RNC válido').toMatchObject({
      status: 201,
      kind: 'RNC',
    });
    expect(await createClient(request, tok, cedula(nextSeed())), 'Cédula válida').toMatchObject({
      status: 201,
      kind: 'CEDULA',
    });
    // RNC con control inválido → 400.
    const badRnc = rnc(nextSeed());
    const wrong = badRnc.slice(0, 8) + String((Number(badRnc.slice(-1)) + 1) % 10);
    expect((await createClient(request, tok, wrong)).status, 'RNC control malo').toBe(400);
    // Reintento dual: un NIF español válido se acepta en un despacho DO.
    expect(await createClient(request, tok, nif(nextSeed())), 'NIF en DO (dual)').toMatchObject({
      status: 201,
      kind: 'NIF',
    });
  });
});
