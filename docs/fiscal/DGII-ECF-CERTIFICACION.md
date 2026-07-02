# Certificación e-CF ante la DGII — ciclo cerrado y pasos del owner

**Deadline legal: 15-nov-2026** (Ley 32-23 de Facturación Electrónica, obligatoria para todos los
contribuyentes RD en la última ventana). Este documento describe qué quedó automatizado en el código
(ciclo de transmisión de punta a punta) y qué pasos **solo el owner puede dar** (certificado real,
altas en la DGII, corrida del kit de certificación).

---

## Qué hace ya la plataforma (sin intervención manual)

Con `DGII_ENV` definido y el `.p12` del despacho cargado, una factura DO recorre sola este ciclo:

```
emisión (eNCF de rango autorizado, cadena, XML e-CF)
  → transmisión a la DGII (semilla → token → recepción → TrackId)      [tras emitir, best-effort]
  → si falla el transporte: PENDING sin TrackId
       → cron ecf-retry (cada 10 min): retransmite con backoff 5·2ⁿ min (techo 6 h, tope 8 intentos)
       → tope agotado → REJECTED con causa clara (reintento manual siempre disponible)
  → con TrackId: PENDING
       → cron ecf-retry: consulta el acuse (polling con el mismo backoff/tope)
       → acuse final → ACCEPTED / REJECTED persistido en la factura
```

- **Cada intento y cada acuse** queda en la cadena fiscal inmutable (`FiscalEvent`, append-only):
  `ecf.transmitted`, `ecf.transmit_failed`, `ecf.accepted`, `ecf.rejected`, `ecf.retry_exhausted`.
- **Idempotencia**: un e-CF aceptado o en trámite (con TrackId) nunca se reenvía — el reintento no
  puede duplicar el comprobante en la DGII.
- **Rechazos**: el motivo de la DGII (`ecfStatusDetail`) se muestra destacado en el detalle de la
  factura, con corrección por el flujo de rectificativas (`POST /ledger/invoices/:id/rectify` →
  nota de crédito e-CF **tipo 34**, eNCF de su propio rango). La factura original es inmutable.
- **Gating**: sin `DGII_ENV` nada cambia (facturas `STUBBED`, cron inactivo, coste cero).

### Simulacro de certificación

`POST /api/dgii/certification/run` (FIRM_ADMIN, body `{ "matterId": "..." }`) emite por el flujo REAL
el set que la plataforma emite hoy: **31** crédito fiscal (simple y multilínea) y **34** nota de
crédito (rectificativa), los transmite y devuelve número/TrackId/estado por escenario. Solo funciona
con `DGII_ENV=test` o `cert` — **nunca** contra `prod`.

> Nota: el kit CerteCF vigente puede exigir escenarios adicionales según el perfil del emisor
> (otros tipos de comprobante, contingencia, anulaciones). Revisar el kit descargado de la OFV y
> ampliar el set si la DGII lo pide; el comando está en
> `apps/api/src/dgii/certification/ecf-certification.service.ts`.

---

## Pasos que quedan EN MANOS DEL OWNER

1. **Certificado digital real (.p12)** — obtener un certificado de firma digital de una CA acreditada
   por INDOTEL (p. ej. Avansi/Viafirma, Cámara TIC) a nombre del contribuyente emisor. Subirlo por
   despacho en Ajustes (`POST /dgii/certificate`).
2. **Alta como emisor e-CF en la DGII** — en la Oficina Virtual (OFV): solicitar la autorización de
   emisor de e-CF y descargar el **kit de certificación** vigente. Requiere RNC activo y al día.
3. **Rangos eNCF autorizados** — solicitar en la OFV rangos para los tipos **31** y **34** (mínimo) y
   registrarlos en Ajustes (`POST /dgii/ecf-sequences`). Sin rango registrado la numeración cae a la
   serie interna (no válida para e-CF real).
4. **Entorno de pruebas** — `DGII_ENV=test` (TesteCF): emitir una factura DO real de prueba y verificar
   que acaba con TrackId y estado final sin intervención (criterio de éxito del ciclo). Ajustar
   `DGII_BASE_URL` solo si la DGII cambia las rutas publicadas.
5. **Certificación** — `DGII_ENV=cert` (CerteCF): correr el simulacro (`/dgii/certification/run`),
   cotejar los resultados con el kit y repetir hasta que la DGII apruebe. En esta fase se ratifica
   también el perfil XAdES exacto (ver `docs/fiscal/FINISHING-CHECKLIST.md`, pendientes 1–2).
6. **Producción** — con la autorización emitida: `DGII_ENV=prod`. Vigilar el estado e-CF de las
   primeras facturas reales (panel de la factura + eventos `ecf.*` en la cadena fiscal).

### Variables de entorno

| Variable          | Valores             | Efecto                                                    |
| ----------------- | ------------------- | --------------------------------------------------------- |
| `DGII_ENV`        | _(vacío)_           | Todo apagado: facturas `STUBBED`, cron inactivo (default) |
|                   | `test`              | TesteCF (pruebas libres)                                  |
|                   | `cert`              | CerteCF (kit de certificación)                            |
|                   | `prod`              | Producción                                                |
| `DGII_BASE_URL`   | URL                 | Sobreescribe el host del entorno (opcional)               |
| `DGII_TIMEOUT_MS` | ms (default 20 000) | Timeout HTTP contra la DGII                               |

---

## Referencias de código

- Transmisión + acuse + eventos: `apps/api/src/dgii/ecf-transmission.service.ts`
- Cron de reintento/polling: `apps/api/src/dgii/ecf-retry.cron.ts` (+ `ecf-retry.logic.ts`, backoff/tope)
- Rectificativa general (nota de crédito 34): `LedgerService.rectifyInvoice`
- Simulacro de certificación: `apps/api/src/dgii/certification/`
- Seams de firma y perfil XAdES pendientes de cert real: `docs/fiscal/FINISHING-CHECKLIST.md`
