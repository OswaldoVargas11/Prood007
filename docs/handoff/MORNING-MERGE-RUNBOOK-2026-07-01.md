# Runbook de merge matutino — 2026-07-01

**Autor:** Aurora (orquestadora). **Para:** owner. **Verificado con git**, no con comentarios del tablero.

## TL;DR — una sola acción de merge

`agents/sandbox` es un **fast-forward limpio** sobre `main`:

```
git rev-list --count main..agents/sandbox   →  31   (sandbox por delante)
git rev-list --count agents/sandbox..main    →   0   (main NO tiene nada que falte en sandbox)
```

→ **No hay ramas dispersas que reconciliar ni conflictos esperables.** Toda la obra de la noche
está consolidada en `agents/sandbox`. Revisar y hacer push/PR de **esa única rama** (HEAD `4da3c92`).

> Las tarjetas del tablero "seams fiscales — no puedo pushear" (`38c45125`) y "pentest — no puedo
> pushear" (`9a026059`) sugieren ramas separadas; **no lo son**: ese trabajo ya está dentro de
> `agents/sandbox` (ver inventario). El bloqueo real era sólo "agentes no pushean", no divergencia.

## Inventario de `agents/sandbox` (31 commits sobre main)

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

- `467d8c3b` **UI mínima del workflows builder** — el backend (LAW-22) ya está en `agents/sandbox`,
  así que se puede construir sin esperar al merge. Quedó parqueada (sequencing) tras T-3; lista para
  activar a Tomás en el próximo ciclo con checkout.
