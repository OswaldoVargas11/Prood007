# Webhooks salientes (Ola 2c)

> Documento vivo del programa de mejora continua — generado 2026-06-27.

Notifican a sistemas de terceros cuando ocurren eventos en el despacho, cerrando parte del gap de
"ecosistema / extensibilidad" frente a Clio. Diseño deliberadamente pequeño y seguro.

## Modelo

`WebhookEndpoint` (una tabla, RLS por tenant, fail-closed — migración `20260627120000_webhook_endpoints`):

| Campo      | Notas                                                        |
| ---------- | ------------------------------------------------------------ |
| `tenantId` | Aislamiento RLS (policy `tenant_isolation`).                 |
| `url`      | Destino HTTPS validado anti-SSRF.                            |
| `secret`   | Para firmar el cuerpo (HMAC-SHA256). Se revela solo al alta. |
| `events`   | CSV de tipos suscritos (hoy: `matter.created`).              |
| `active`   | Permite desactivar sin borrar.                               |

## API (solo `FIRM_ADMIN`)

- `POST /api/webhooks/endpoints` — alta; devuelve el `secret` (única vez).
- `GET /api/webhooks/endpoints` — lista (sin secreto).
- `DELETE /api/webhooks/endpoints/:id` — baja.
- `POST /api/webhooks/endpoints/:id/test` — envía un evento `ping`.

## Entrega y firma

El cuerpo es `{ event, data, sentAt }`. Se firma con `HMAC-SHA256(secret, body)` y se envía en la cabecera
`X-Lawzora-Signature: sha256=<hex>` (más `X-Lawzora-Event`). El receptor recomputa la firma para verificar
autenticidad. La entrega es **best-effort y fire-and-forget**: un endpoint caído nunca afecta a la
operación que originó el evento (p. ej. crear un expediente). Timeout de 5 s por entrega.

## Seguridad — SSRF

La URL es de usuario, así que un webhook es un vector SSRF clásico. Mitigación (en alta **y** antes de cada
envío, defensa en profundidad):

- **HTTPS obligatorio.**
- **Rechazo de hosts internos/privados**: `localhost`, `*.local`, `*.internal`, IPv4 privadas/reservadas
  (`127/8`, `10/8`, `192.168/16`, `172.16-31`, `169.254/16` incl. metadata, `0/8`), IPv6 loopback/ULA/link-local.
- **Resolución DNS antes de cada envío** (Ola 3b): se resuelve el host y se rechaza si **cualquier IP
  resuelta** es interna/privada (incl. IPv4 mapeada en IPv6 `::ffff:`). Cierra el hueco de DNS rebinding /
  registros A privados; si el host no resuelve, no se entrega.

**Residual:** la resolución se hace en el momento del envío (autoritativo), pero un atacante con control de
DNS y TTL muy bajo podría teóricamente cambiar la IP entre la resolución del guard y la del `fetch`
(ventana TOCTOU mínima). Mitigación completa: salir por un egress proxy con allowlist; pendiente si el
modelo de amenaza lo exige.

## Eventos

Hoy se emite `matter.created` (best-effort desde `MattersService.create`). Añadir eventos nuevos es
trivial: ampliar `KNOWN_WEBHOOK_EVENTS` y llamar a `WebhooksService.dispatch(...)` en el punto de origen.
Futuro: log de entregas + reintentos con backoff; firma con timestamp anti-replay.
