# 07 · CI/CD y seguridad

[⬅ Volver al índice](README.md)

---

## 7.1 Pipeline de integración continua (GitHub Actions)

```mermaid
flowchart TB
  classDef gate fill:#fecaca,stroke:#b91c1c,color:#450a0a;
  classDef job fill:#bfdbfe,stroke:#1e40af,color:#0b2559;

  trig["push (main, feat/**) · PR"] --> setup["setup<br/>(pnpm cache + compilar paquetes)"]:::job

  setup --> lint["lint-typecheck"]:::job
  setup --> unit["unit + coverage<br/>(compliance ≥90% · web)"]:::gate
  setup --> rls["api-integration (RLS)<br/>corre como rol legalflow_app"]:::gate
  setup --> e2e["web-e2e (Playwright)<br/>login BFF + aislamiento de rol"]:::gate
  setup --> sec["security<br/>(audit prod · licencias · gitleaks · CodeQL)"]:::gate
  setup --> mig["migration-check<br/>(prisma migrate diff, sin drift)"]:::gate
  setup --> build["build (monorepo)"]:::job

  lint & unit & rls & e2e & sec & mig & build --> ok["ci-ok (agregador)<br/>= check requerido"]:::gate

  fisc["fiscal-conformance<br/>golden-file ES+DO (determinista)"]:::gate --> ok
```

### Gates obligatorios (branch protection)

| Check                | Qué garantiza                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ci-ok`              | Agrega lint/type, unit+coverage, RLS, e2e, security, migration, build                                                             |
| `fiscal-conformance` | Regenera registros fiscales (Verifactu + e-CF) con entradas congeladas y compara contra _golden files_. **Sin LLM, determinista** |

> **Importante:** "hecho" = verde en GitHub Actions real. El check requerido es `CI OK` (CodeQL puede quedar UNSTABLE sin bloquear). Los tests de RLS corren como rol de mínimo privilegio para que las políticas no se puedan saltar.

---

## 7.2 Agentes de IA en CI (no bloqueantes)

```mermaid
flowchart LR
  classDef ext fill:#fde68a,stroke:#b45309,color:#3f2d00;

  fail["fiscal-conformance falla"] --> triage["fiscal-conformance-triage<br/>(claude-sonnet-4-6)"]:::ext
  triage --> cls{clasifica diff}
  cls -- "regresión accidental + fix mecánico" --> pr["Propone PR (no mergea)"]
  cls -- "cambio fiscal intencional" --> iss["Crea issue con análisis"]
  triage -. "guard anti-fork + cierra PR que toque<br/>migraciones/RLS/golden" .-> safe["Blindaje"]

  cron["lunes 06:00 UTC"] --> scout["improvement-scout<br/>(claude-sonnet-4-6)"]:::ext
  scout --> backlog["1 issue priorizado<br/>(esfuerzo S/M/L + riesgo fiscal)"]
```

- `semgrep.yml` (SAST OWASP/Node/React) corre como **soft gate** (visible, aún no requerido).

---

## 7.3 Capas de seguridad (defensa en profundidad)

```mermaid
flowchart TB
  classDef sec fill:#fecaca,stroke:#b91c1c,color:#450a0a;

  subgraph borde["Borde"]
    cf["Cloudflare WAF/DDoS"]:::sec
    helmet["Helmet + CSP + HSTS"]:::sec
    cors["CORS fail-closed (prod)"]:::sec
    thr["Throttler 300/min (Redis)"]:::sec
  end
  subgraph identidad["Identidad"]
    jwt["JWT acceso/refresh separados"]:::sec
    mfa["MFA TOTP"]:::sec
    rot["Rotación refresh + detección de reuso"]:::sec
    plat["JWT plataforma aislado"]:::sec
  end
  subgraph datos["Datos"]
    rls["RLS Postgres (3 roles, fail-closed)"]:::sec
    enc["Cifrado en reposo AES-256-GCM + keyring"]:::sec
    immut["Inmutabilidad fiscal/legal (append-only + hash)"]:::sec
    tok["Tokens OAuth cifrados"]:::sec
  end
  subgraph gobernanza["Gobernanza"]
    audit["AuditLog append-only"]:::sec
    legal["Gate de aceptación legal (servidor)"]:::sec
    sub["Gate de suscripción (402)"]:::sec
    wh["Webhooks HMAC-SHA256"]:::sec
  end

  borde --> identidad --> datos --> gobernanza
```

Auditorías previas (ver `docs/security/`): white-box y black-box jun-26 — sin críticos abiertos; medios conocidos (DMARC `p=none`, CSP de contenido por nonce pendiente). Acciones de owner: rotación de secretos, certificados fiscales reales.
