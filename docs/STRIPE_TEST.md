# Guion de verificación de Stripe en vivo (modo TEST)

> Objetivo: pasar **eventos reales de Stripe** por el cobro online antes de construir encima (dunning,
> recurrente). Todo en **modo test**: claves de test, tarjeta `4242…`, Stripe CLI. **Cero dinero, cero
> entidad, cero compromiso.** Verifica el cimiento, luego construye.
>
> Estado verificado con mocks (CI): firma→4xx, idempotencia por `providerRef`, importe/moneda, RLS por
> tenant. Estado verificado en vivo SIN claves: el endpoint público es alcanzable, público y **falla
> cerrado** (400 sin firma / con firma falsa; 401 en checkout sin token). **Lo que falta es lo de abajo.**

## 0) Requisitos

- App corriendo en local: API `:4000`, web `:3000` (ya lo está).
- **Claves de TEST** de tu cuenta Stripe: Dashboard → Developers → API keys → _Secret key_ (`sk_test_…`).
- **Stripe CLI** (no está instalado). Instálalo:
  - Windows (scoop): `scoop install stripe` · o descarga: https://github.com/stripe/stripe-cli/releases
  - Verifica: `stripe version`

## 1) Claves en el backend

En `apps/api/.env` añade (TEST):

```
STRIPE_SECRET_KEY="sk_test_xxx"
APP_PUBLIC_URL="http://localhost:3000"
# STRIPE_WEBHOOK_SECRET lo rellenas en el paso 2 (lo imprime el CLI).
```

Reinicia la API tras cada cambio de `.env`.

## 2) Reenvío del webhook + secreto de firma REAL

```
stripe login
# ⚠️ CLAVE PARA CONNECT: los cargos son DIRECTOS en la cuenta conectada del despacho, así que el evento
#   checkout.session.completed se genera en la CUENTA CONECTADA, no en la plataforma. Hay que reenviar
#   los eventos de cuentas conectadas, o el webhook nunca llega (esto un mock no lo revela):
stripe listen --forward-connect-to localhost:4000/api/payments/webhook/stripe
```

El CLI imprime `> Ready! ... whsec_xxxx`. Copia ese `whsec_…` a `apps/api/.env`:

```
STRIPE_WEBHOOK_SECRET="whsec_xxxx"
```

Reinicia la API. Deja `stripe listen` corriendo en su terminal.

## 3) Conectar la cuenta del despacho (Connect Standard, test)

1. Entra como admin → **Ajustes** → tarjeta **"Cobro online (Stripe)"** → **Conectar Stripe**.
2. Completa el onboarding de prueba de Stripe (usa los datos de test que ofrece Stripe; puedes usar el
   botón de "saltar"/rellenar con datos de prueba). Al volver, el estado debe decir **Conectado**.
   - Esto fija `Tenant.stripeAccountId`. (Confirma: `GET /api/payments/connect/status` → `connected:true`.)

## 4) Pago real con tarjeta de test → webhook firmado → concilia

1. Crea/abre una factura emitida (no pagada) y pulsa **"Pagar online"** → te lleva a Stripe Checkout.
2. Paga con `4242 4242 4242 4242`, fecha futura, CVC cualquiera.
3. Observa en la terminal de `stripe listen`: llega `checkout.session.completed` → se reenvía → respuesta
   `200` de tu API.
4. Verifica:
   - La factura queda **PAID** (`GET /api/ledger/invoices/:id` → `status: "PAID"`, `paidAt` no nulo).
   - Hay **un** `Payment` con `method: "STRIPE"` y `providerRef` = el PaymentIntent
     (`GET /api/payments/by-invoice/:id`).

## 5) Idempotencia (lo que los mocks no cazan de verdad)

Stripe **reentrega** eventos. Reenvía el MISMO evento y confirma que **no** duplica:

```
# Toma el id del evento (evt_…) de la salida de `stripe listen` o del Dashboard → Events.
stripe events resend evt_xxx
```

- `GET /api/payments/by-invoice/:id` debe seguir mostrando **UN** `Payment` (no dos), y `amountPaid`
  no debe haber crecido. (Lo garantiza el `@@unique(providerRef)` + dedup.)

## 6) Firma manipulada → rechazo (4xx)

Con el secreto ya configurado, una firma inválida debe dar **400** sin procesar:

```
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST \
  http://localhost:4000/api/payments/webhook/stripe \
  -H "Content-Type: application/json" -H "stripe-signature: t=1,v1=manipulada" \
  -d '{"type":"checkout.session.completed","data":{"object":{"metadata":{"invoiceId":"x","tenantId":"y"},"amount_total":1000,"currency":"eur"}}}'
# Esperado: HTTP 400  (constructEvent rechaza la firma → BadRequest; NO concilia nada)
```

## 7) Importe / moneda

- **Parcial:** el botón "Pagar online" cobra el **saldo pendiente completo**, así que el parcial vía
  Stripe no aplica en este flujo (el parcial se prueba por la API manual `POST /payments {amount}`, ya
  cubierto por e2e: deja la factura en **PARTIAL**, no PAID).
- **Moneda:** la sesión se crea en la moneda de la factura; si por lo que sea llegara un evento con otra
  moneda, `reconcile` lo **rechaza** (no concilia USD contra EUR). Cubierto por e2e; en vivo la moneda
  cuadra por construcción.

## Checklist de "cimiento verificado"

- [ ] Pago test con `4242…` → webhook **firmado** llega y la factura queda **PAID** con un `Payment` STRIPE.
- [ ] `stripe events resend` del mismo evento → **no** duplica (`amountPaid` estable, un solo `Payment`).
- [ ] Firma manipulada → **400** sin conciliar.
- [ ] (Connect) los eventos llegan vía `--forward-connect-to` (cuenta conectada, no plataforma).

Cuando los cuatro estén ✅, el cobro online está **probado de verdad** y la cola de Fase 1 (retainer,
dunning, recurrente) se apoya en una base sólida. Si algo falla, normalmente es: (a) no usar
`--forward-connect-to` (el evento nunca llega), (b) `STRIPE_WEBHOOK_SECRET` desactualizado tras reiniciar
`stripe listen`, o (c) cuenta conectada sin onboarding completo (`charges_enabled=false`).
