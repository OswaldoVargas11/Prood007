# Reestructuración de planes de suscripción (SaaS de plataforma)

Cobro **despacho → Lawzora**. NO toca el cobro **despacho → sus clientes** (Stripe Connect, módulo `payments`/`billing`), que queda intacto.

## Definición canónica (confirmada)

| Tier                                                     | Mensual (lista) | Anual (2 meses gratis, −16,7% → ×10) | Bienal (−25% sobre 24 m → ×18) |
| -------------------------------------------------------- | --------------- | ------------------------------------ | ------------------------------ |
| Esencial                                                 | 45 €            | 450 €/año                            | 810 €/2 años                   |
| **Profesional** ⭐                                       | 69 €            | 690 €/año                            | 1.242 €/2 años                 |
| Avanzado                                                 | 99 €            | 990 €/año                            | 1.782 €/2 años                 |
| **Fundador** (funciones Profesional, congelado, cupo 18) | —               | 390 €/año                            | 702 €/2 años                   |

- Moneda: ES → **EUR**, RD → **USD** (DOP donde aplique), configurable; por defecto **EUR × FX**. Ningún país hardcodeado.
- Fundador: entrada **solo** con prepago anual o bienal; tarifa **congelada de por vida**; **cupo 18** con contador real que cierra al llenarse.
- **Eliminado** el descuento por volumen (39/35/29).
- **Grandfathering**: las suscripciones existentes (incluidos fundadores actuales) **no se reprecian ni migran**; el esquema nuevo aplica solo a altas nuevas (ver más abajo).

## Fuente de verdad única

`packages/domain/src/pricing.ts` — catálogo canónico (tiers, ciclos, FX, Fundador) + helpers. **Lo leen los tres**: landing, app y backend (y el script de Stripe). Cero precios duplicados a mano.

## Inventario: dónde aparecían planes/precios (y qué pasó)

| Superficie              | Archivo                                                                 | Antes                                      | Ahora                                                                                              |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Catálogo (núcleo)       | `apps/api/src/subscription/plans.ts`                                    | `SEAT_TIERS` 39/35/29 + helpers de volumen | Re-exporta el catálogo de `@legalflow/domain`; solo helpers de acceso/prueba + plan del tenant     |
| Catálogo (nuevo)        | `packages/domain/src/pricing.ts`                                        | —                                          | **Nuevo**: única fuente de verdad                                                                  |
| Estado/planes API       | `apps/api/src/subscription/subscription.service.ts`                     | precio por volumen                         | sirve el **catálogo** en la moneda del despacho + estado                                           |
| Checkout/Stripe         | `apps/api/src/subscription/stripe-billing.service.ts`                   | 1 price (mensual) + 1 (anual) por env      | resuelve `tier×ciclo×moneda` desde `STRIPE_PRICE_MAP`; guarda el tier; Fundador exige anual/bienal |
| Resolución de Price IDs | `apps/api/src/subscription/stripe-prices.ts`                            | —                                          | **Nuevo**: lee `STRIPE_PRICE_MAP` (JSON)                                                           |
| DTO checkout            | `apps/api/src/subscription/dto/checkout.dto.ts`                         | seats, cycle (M/A), founder                | + `tier`, cycle incluye **BIENNIAL**                                                               |
| Cupo Fundador público   | `apps/api/src/subscription/public-pricing.controller.ts`                | —                                          | **Nuevo** `GET /pricing/founder` (para la landing)                                                 |
| Super-admin             | `apps/api/src/platform/platform.service.ts`                             | €/mes por volumen                          | €/mes indicativo según el tier del despacho                                                        |
| Landing (precios)       | `apps/web/src/components/landing/landing-pricing.tsx` (+ `landing.tsx`) | tarjeta única con tramos de volumen        | **3 tiers + toggle Mensual/Anual/Bienal + bloque Fundador con cupo**, leyendo del catálogo         |
| Panel de suscripción    | `apps/web/src/components/lexora/subscribe-panel.tsx`                    | 1 carta Pro + volumen                      | **3 cartas de tier** + toggle 3 ciclos + bloque Fundador; ajuste de plazas preserva el plan        |
| Consola super-admin     | `apps/web/src/components/lexora/platform-console.tsx`                   | dinámico (backend)                         | sin cambios de lógica (lee del backend)                                                            |
| Tipos/hooks web         | `apps/web/src/lib/types.ts`, `hooks.ts`                                 | `SubscriptionTier` volumen                 | `PlanTierDef`/`PlanPriceRow`, `tier` en checkout, `useFounderStatus`                               |
| i18n                    | `apps/web/messages/es.json` (`landing.pricing.*`, `subscription.*`)     | 39/35/29 hardcodeado                       | nombres de tier, ciclos, copy de Fundador; **sin precios hardcodeados**                            |

**Emails**: no hay plantillas de email de suscripción con precios (los recordatorios de prueba/muro no listan importes) — nada que cambiar.

## Stripe como código

`scripts/setup-stripe.mjs` (`pnpm stripe:setup`). Crea Products (4) + Prices (3 tiers × 3 ciclos × {EUR,USD} + Fundador × {anual,bienal} × {EUR,USD} = **22 prices**) leyendo del catálogo.

- Lee `STRIPE_SECRET_KEY` del entorno (**nunca** incrustada). Valida prefijo ↔ `--mode`.
- `--dry-run` imprime una **tabla** y no escribe nada.
- Idempotente: cada Price lleva un `lookup_key` estable; si existe, se reutiliza.
- `--archive-old` desactiva los Price activos de nuestros productos que no estén en el esquema nuevo (archivar **no** cancela suscripciones existentes → grandfathering a salvo).
- Escribe los Price IDs a `scripts/stripe-prices.<mode>.json` (mapa `clave→price_id`) para pegar en `STRIPE_PRICE_MAP`.

> El bienal se modela como **un cobro único cada 2 años** (`interval=year, interval_count=2`).

## Grandfathering (cómo se preserva)

- No hay migración de datos ni cambios en suscripciones de Stripe existentes.
- `cambiar plazas` solo ajusta la `quantity` del item existente → **conserva el Price (precio) actual** del despacho.
- Los fundadores actuales siguen en su Price; los nuevos entran en el Price de Fundador (inmutable) → tarifa congelada por construcción.
- El catálogo nuevo solo se usa en **altas nuevas** (Checkout).

## Sin cambios sensibles

- **Sin migración de BD**: `billingCycle` y `plan` ya son columnas `String` libres; `BIENNIAL` y los nombres de tier caben sin tocar el esquema, RLS ni numeración/fiscal.
- **Golden files de facturación**: NO afectados (son del cumplimiento fiscal `packages/compliance`, no del SaaS). No se regeneró ninguno.

---

# Tus pasos finales (owner)

> Yo no ejecuto el script, no toco tus claves ni el Stripe live, y no mergeo.

1. **Revisar en seco (test)**

   ```bash
   STRIPE_SECRET_KEY=sk_test_… pnpm stripe:setup --mode test --dry-run
   ```

   Comprueba la tabla (importes, intervalos, monedas).

2. **Crear en test y validar checkout**

   ```bash
   STRIPE_SECRET_KEY=sk_test_… pnpm stripe:setup --mode test
   ```
   - Pega el contenido de `scripts/stripe-prices.test.json` en la env `STRIPE_PRICE_MAP` del entorno de test.
   - Prueba un checkout de cada ciclo y de Fundador.

3. **Crear en live**

   ```bash
   STRIPE_SECRET_KEY=sk_live_… pnpm stripe:setup --mode live
   ```

4. **Archivar los Price antiguos** (cuando el esquema nuevo esté validado)

   ```bash
   STRIPE_SECRET_KEY=sk_live_… pnpm stripe:setup --mode live --archive-old
   ```

5. **Rellenar Price IDs en prod**: pega `scripts/stripe-prices.live.json` en la env `STRIPE_PRICE_MAP` (API). Opcional: `PLAN_FX_USD` para fijar la tasa EUR→USD.

6. **Activar el contador de cupo Fundador**: ya está activo (cuenta `tenant.isFounder`, cap 18). Solo verifica que `GET /api/pricing/founder` devuelve `{ slotsLeft, cap }`.

7. **Revisar y mergear** el PR.
