# Transmisión de e-CF a la DGII (República Dominicana)

Estado: **Fase 1 entregada** — el _motor de transmisión_ está construido, probado y **gated**. Hoy el
e-CF se construye y persiste pero **no se transmite** (`STUBBED`), igual que antes. Este documento explica
qué hace falta para cerrarlo y en qué fases.

> ⚠️ **Lo que tú necesitas (no se puede cerrar sin esto):** un **certificado digital del emisor** (`.p12`)
> emitido por una entidad de certificación autorizada en RD, y estar **registrado como Emisor Electrónico**
> ante la DGII para acceder a los entornos TesteCF/CerteCF. La **certificación** se aprueba completando el
> _set de pruebas_ en CerteCF.

---

## Cómo funciona (flujo DGII implementado)

El motor (`apps/api/src/dgii/`) implementa el flujo oficial:

1. **Semilla** — `GET …/fe/autenticacion/api/semilla` → XML semilla.
2. **Firma** de la semilla con el certificado del emisor (firma XML envuelta, RSA-SHA256).
3. **Token** — `POST …/fe/autenticacion/api/validacionsemilla` (semilla firmada) → token Bearer.
4. **Firma** del e-CF con el certificado.
5. **Recepción** — `POST …/fe/recepcion/api/ecf` (e-CF firmado, Bearer) → **TrackId**.
6. **Acuse/estado** — `GET …/fe/consultaestado/api/estado?trackid=…` → Aceptado / Rechazado / En Proceso.

Entornos (`DGII_ENV`): `test` (TesteCF, pruebas libres) · `cert` (CerteCF, **certificación**) · `prod` (eCF).

### Qué está verificado y qué queda

- ✅ **Verificado con test unitario** (`dgii-signer.spec.ts`, corre en CI): parseo del `.p12`, firma XML
  envuelta y **verificación criptográfica** de la firma con un certificado de prueba.
- ⏳ **Pendiente de cerrar con tu certificado real (en CerteCF):**
  - **XAdES-BES**: la DGII pide XML-DSig + propiedades cualificadas (SigningTime, SigningCertificate). El
    núcleo XML-DSig está; las propiedades cualificadas se afinan contra el validador de la DGII.
  - **Rutas/campos exactos** del multipart y forma de las respuestas: confirmar con el kit de
    certificación vigente (las URLs son sobreescribibles con `DGII_BASE_URL`).
  - **Set de pruebas de certificación** (los e-CF de muestra que exige CerteCF).

---

## Fases

- **Fase 1 (HECHA):** motor de transmisión (config por entorno, cliente semilla/token/recepción/estado,
  firma con certificado, servicio orquestador gated) + test unitario de la firma.
- **Fase 2 (HECHA — flujo end-to-end):** cableado a la emisión de facturas DO (al emitir un e-CF se
  **transmite automáticamente** tras commit; la emisión nunca se rompe si la DGII falla), **estado** en
  `Invoice` (`ecfStatus`/`ecfTrackId`/`ecfStatusDetail`/`ecfSubmittedAt`), **custodia del certificado
  `.p12` por despacho** (cifrado en reposo AES-256-GCM, contraseña cifrada aparte) y **endpoints**:
  - `GET /api/dgii/status` — ¿transmisión activada? + estado del certificado.
  - `POST /api/dgii/certificate` (multipart `file` = .p12 + `password`) — sube el certificado (solo admin).
  - `POST /api/dgii/invoices/:id/transmit` — (re)transmite el e-CF de una factura.
  - `POST /api/dgii/invoices/:id/refresh` — consulta el acuse/estado en la DGII.
    Todo **gated**: sin `DGII_ENV` o sin certificado, las facturas quedan en `STUBBED` (no se transmite).
- **Pendiente menor:** UI (badge de estado e-CF en facturas + subida de certificado en Ajustes desde el
  web) y un cron de reintentos automáticos de los `PENDING`. El flujo backend ya está completo.

## Qué tienes que hacer tú (cuando tengas el certificado)

1. Registrarte como **Emisor Electrónico** en la DGII y obtener el **certificado digital** (`.p12`).
2. Poner `DGII_ENV="cert"` (entorno de certificación) en los secrets de la API.
3. (Fase 3) Subir el `.p12` del despacho + su contraseña en Ajustes.
4. Completar el **set de pruebas** en CerteCF hasta la aprobación; luego `DGII_ENV="prod"`.

## Privacidad / seguridad

El `.p12` y su contraseña se guardarán **cifrados** (AES-256-GCM) y se descifran en memoria solo para
firmar; nunca se persiste la clave privada en claro ni se loguea. La rotación de la clave maestra de
cifrado (`DATA_ENCRYPTION_KEY`) es responsabilidad del owner (no se delega).
