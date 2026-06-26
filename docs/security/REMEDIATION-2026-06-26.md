# Remediación pentest 2026-06-26 — medios + DNS

Acompaña a `PENTEST-BLACKBOX-2026-06-26.md`. Cubre los 2 hallazgos medios y los bajos de DNS.

---

## ✅ M-2 — CSP de contenido en la app web (PARCIAL, ya en código)

**Hecho en este cambio** (`apps/web/next.config.mjs`): se añaden a la CSP **enforced** las directivas que endurecen sin riesgo de romper hidratación/scripts/OAuth (no se añade `default-src`, que cascadearía):

- `base-uri 'self'` — bloquea inyección de `<base>`.
- `object-src 'none'` — mata `<object>/<embed>/plugins`.
- `form-action 'self'` — formularios solo a nuestro origen.
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), browsing-topics=()`.
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` (aísla pero deja vivir los popups de OAuth y el Google Picker).

Cierra base-uri injection, object/plugin XSS y form-hijacking. **Desplegable sin riesgo.**

### ⏳ Follow-up (NO incluido — requiere validación en preview): `script-src` con nonce

La defensa anti-XSS principal (`default-src 'self'` + `script-src` con **nonce**) **no** se mete a ciegas: Next inyecta scripts inline de hidratación y un `script-src` mal puesto **tumba prod**. Hay que hacerlo con nonce por petición vía middleware y **validarlo en un build de preview** antes de enforce. Receta lista para aplicar:

```ts
// apps/web/src/middleware.ts — añadir al inicio del handler, antes de las redirecciones:
const nonce = btoa(crypto.randomUUID());
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://accounts.google.com https://apis.google.com`,
  `style-src 'self' 'unsafe-inline'`, // Tailwind/inline styles; endurecer luego con hashes
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? ''} https://o*.ingest.sentry.io`,
  `frame-src 'self' https://accounts.google.com https://*.office.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `form-action 'self'`,
  `upgrade-insecure-requests`,
].join('; ');

const requestHeaders = new Headers(req.headers);
requestHeaders.set('x-nonce', nonce); // Next lo aplica a sus <script>
// propagar requestHeaders en cada NextResponse.next({ request: { headers: requestHeaders } })
// y en la respuesta: res.headers.set('Content-Security-Policy-Report-Only', csp)  ← primero Report-Only
```

**Plan de despliegue seguro:**

1. Arrancar en **`Content-Security-Policy-Report-Only`** + un `report-uri`/Sentry. Cero bloqueo.
2. Validar en `next build && next start` local (NO en dev: dev usa `eval` para HMR y necesita `'unsafe-eval'`).
3. Recorrer login, OAuth Google/MS, cloud-import (Picker), Stripe checkout, add-ins Office, dictado.
4. Con reportes limpios, cambiar el header a `Content-Security-Policy` (enforce).

> Ojo: usar nonce fuerza render dinámico (sin static optimization). Aceptable en una app tras login.

---

## ⚠️ M-1 — DMARC a enforcement (ACCIÓN OWNER: DNS en Cloudflare)

No es código. En Cloudflare DNS de `lawzora.com`:

**Actual:** `_dmarc` TXT = `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`

**Paso 1 (1-2 semanas, observar):**

```
_dmarc  TXT  "v=DMARC1; p=quarantine; pct=100; adkim=s; aspf=s; rua=mailto:rua@dmarc.brevo.com"
```

**Paso 2 (tras confirmar que el correo legítimo de Brevo pasa alineado):**

```
_dmarc  TXT  "v=DMARC1; p=reject; pct=100; adkim=s; aspf=s; rua=mailto:rua@dmarc.brevo.com"
```

### L-1 — SPF a `-all` (hardfail)

Cuando confirmes que todos los emisores legítimos están en el `include` (Brevo + Cloudflare), cambia el final del registro SPF de `~all` a `-all`.

### L-2 — Registro CAA

Restringe qué CA pueden emitir certs (Cloudflare usa varias). Añade:

```
lawzora.com  CAA  0 issue "letsencrypt.org"
lawzora.com  CAA  0 issue "pki.goog"
lawzora.com  CAA  0 issue "ssl.com"
lawzora.com  CAA  0 issue "comodoca.com"
lawzora.com  CAA  0 issuewild "letsencrypt.org"
lawzora.com  CAA  0 iodef "mailto:rua@dmarc.brevo.com"
```

(Confirma el set de CA reales de tu plan Cloudflare antes de aplicar para no bloquear renovaciones.)

---

## Corrección de hallazgos previos tras revisión white-box

- **A-1 (token Bearer en cliente) → RETIRADO (falso positivo).** El flujo real del navegador guarda el **refresh token en cookie `HttpOnly`+`SameSite=Lax`+`Secure`** (`apps/web/src/lib/server/session.ts`) y el **access token solo en memoria** (`apps/web/src/lib/api.ts`, D-014). Lo que se observó en caja negra (tokens en el body) es el contrato servidor→servidor del API que consume el BFF, no el almacenamiento del cliente. Sin acción.
- **A-2 (stored XSS) → VERIFICADO SEGURO.** Revisión white-box: `escapeHtml()` en todos los emails, PDFs con PDFKit `.text()` (texto plano), plantillas con sustitución literal, cero `dangerouslySetInnerHTML`/`innerHTML` en la web, HTML de emails entrantes saneado. Sin acción.
- **Nota menor (nueva):** la consola _platform_ (super-admin) guarda su token en `sessionStorage` (`apps/web/src/lib/platform.ts`). Es una superficie separada y de uso interno; con la CSP enforce (follow-up) el riesgo de robo por XSS baja. Considerar mover a cookie httpOnly en el futuro.
