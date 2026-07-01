# Runbook de merge matutino — 2026-07-01

**Autor:** Aurora (orquestadora). **Para:** owner. **Verificado con git**, no con comentarios del tablero.

## TL;DR — una sola acción de merge

`agents/sandbox` es un **fast-forward limpio** sobre `main`:

```
git rev-list --count main..agents/sandbox   →  40   (sandbox por delante)
git rev-list --count agents/sandbox..main    →   0   (main NO tiene nada que falte en sandbox)
git merge-base --is-ancestor main agents/sandbox → OK (fast-forward limpio)
```

→ **No hay ramas dispersas que reconciliar ni conflictos esperables.** Toda la obra de la noche
está consolidada en `agents/sandbox`. Revisar y hacer push/PR de **esa única rama** (HEAD `a99a5fd`).

> **Delta desde la versión previa de este runbook** (era 38 commits / HEAD `9bf6072`): se añadieron
> dos commits, ambos solo-docs, sin cambios de código de producto:
> - `46bb3a0` — refresco previo de este runbook (docs).
> - `a99a5fd` — `docs/PROJECT-STATUS.md` nuevo (fuente única de verdad prod vs pendiente) + avisos
>   STALE en `AGENT-REMAINING-ROADMAP.md`/`NEXT-IMPROVEMENTS.md` apuntando a él.
>
> **Delta anterior** (era 33 commits / HEAD `fcb0b6a`): se añadieron cinco commits, todos ya
> trackeados/auditados y sin features a medias:
> - `1acca08` — 3 claves i18n faltantes en `es.json` (anti MISSING_MESSAGE) (LAW-60).
> - `3235585` — **UI mínima del workflows builder de Zora** (dock), backend LAW-22 ya presente (LAW-67).
> - `d3061ab` — refresco previo de este runbook (docs).
> - `d3a3b38` — claims fiscales precisos + lint i18n en CI (LAW-47/49), **dominio fiscal/legal**.
> - `9bf6072` — escape de metacaracteres regex en `i18n-check` (CodeQL js/incomplete-sanitization).
>
> La QA 33/33 sobre `4da3c92` sigue válida para el código transaccional; la UI de LAW-67 tiene su
> propia QA PASS (LAW-68: vitest 9/9, `tsc` limpio, `next lint` OK, `i18n-check` OK).

> Las tarjetas del tablero "seams fiscales — no puedo pushear" (`38c45125`) y "pentest — no puedo
> pushear" (`9a026059`) sugieren ramas separadas; **no lo son**: ese trabajo ya está dentro de
> `agents/sandbox` (ver inventario). El bloqueo real era sólo "agentes no pushean", no divergencia.

## Inventario de `agents/sandbox` (40 commits sobre main)

| Área | Commit(s) | Entregable |
|---|---|---|
| Transaccional T-1 | `07ca13c` (+ `2ff17e9`/`1a72769` i18n) | Funds-flow / closing statement + ledger de escrow con importes |
| Transaccional T-2 | `d599ffa` | Gating de Conditions Precedent + readiness al signing/closing |
| Transaccional T-3 | `4da3c92` | Alertas de plazo (longstop / CP deadline), in-app sólo grupo interno |
| IA — Workflows builder | `a4a4450` / `f20c717` | Motor + persistencia RLS + API `/ai/workflows*` (LAW-22) |
| IA — Streaming + Stop | `85cf631` / `f833030` | Cancelación real del turno + default `claude-opus-4-8` (LAW-21) |
| IA — Eval harness | `db79449` | `pnpm eval:agent` (38 escenarios, baseline 8/12) (LAW-9) |
| Seguridad — Harness | `9a35512` / `89cb32b` | Pentest autenticado authz/IDOR/JWT-JWKS/fiscal (LAW-23) |
| Seguridad — Corrida viva | `3c43c92` | Corrida VIVA del harness + fix BAC en borrado de clientes (LAW-31) |
| Seguridad — Pentest triage | `9d10451` | Test concurrencia eNCF (no-reuso) + triage H-1/H-2 (LAW-3) |
| Fiscal — Seams codeables | `6e08e0a` / `2994465` | e-CF XAdES-BES + Verifactu (firma + QR) (LAW-2) |
| Observabilidad | `25aa6f9` / `df3b9e2` | Trigger append-only en AuditLog + regresión (LAW-7/LAW-15) |
| Crecimiento — Precios | `f1641cb`/`e87f936`, `b1fe2f1`/`1c7a8b8` | Página pública `/es/precios` + ruta pública en middleware (LAW-8/34) |
| DevOps | `2cda6bd` | Worktree aislado por agente (LAW-10) |
| Fiscal/Legal — Auditoría | `fcb0b6a` | Auditoría de superficie fiscal/legal + `i18n-check.mjs` anti-MISSING_MESSAGE (LAW-46), solo docs/tooling |
| Fiscal/Legal — Claims + CI | `d3a3b38` / `9bf6072` | Claims fiscales precisos + lint i18n en CI (LAW-47/49) + escape regex CodeQL en `i18n-check` |
| IA — UI Workflows builder | `3235585` | UI mínima (dock de Zora) para definir/lanzar workflows; QA PASS LAW-68 (LAW-67) |
| i18n — Claves faltantes | `1acca08` | 3 claves faltantes en `es.json` anti MISSING_MESSAGE (LAW-60) |
| Orquestación — Handoff | `106d109` / `d3061ab` / `46bb3a0` | Este runbook de merge matutino (docs) |
| Documentación — Fuente de verdad | `a99a5fd` | `docs/PROJECT-STATUS.md` (prod vs pendiente) + avisos STALE en docs de planificación |

## QA (verificado por Carla, issue `cd0b3d0f`)

Regresión pre-push sobre `agents/sandbox` HEAD `4da3c92`: **33/33 verde** (4 suites).
- Typecheck API + Web: 0 errores.
- T-1 funds-flow (9), T-2 CP gating (7), LAW-22 workflows (5), AuditLog append-only (12).

## Acciones que SÓLO puede hacer el owner (config, no código)

1. **Push/merge** de `agents/sandbox` → `main` (FF) y deploy manual.
2. **IA viva — eval harness (ZOR-3, `238a2b6d`):** setear `ANTHROPIC_API_KEY` + tenant y correr
   `pnpm eval:agent` para el baseline X/38.
3. Revisar el set de secretos/keys habitual antes de desplegar (sin cambios nuevos requeridos por esta tanda).

## Siguiente rebanada lista (no bloqueante)

- **Workflows builder de Zora COMPLETO en sandbox:** backend (LAW-22, `a4a4450`/`f20c717`) + UI
  (LAW-67, `3235585`) + QA PASS (LAW-68). Ya no hay rebanada parqueada; el builder queda funcionalmente
  cerrado a la espera del merge + confirmación owner de LAW-22.
- **Sin trabajo nuevo apilado a propósito:** el cuello de botella es el merge matutino, no la capacidad
  del equipo. Apilar más commits aumentaría la carga de revisión sin mejorar el throughput. Decisión de
  orquestación (Aurora, LAW-70): **consolidar, no apilar** hasta que el merge drene el pipeline.
