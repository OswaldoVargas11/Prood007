# Observabilidad de errores (Sentry) — API

Sentry captura los errores de la **API** en producción: excepciones HTTP no controladas y, sobre todo,
fallos no atrapados de los **crons** (p. ej. el dunning diario) y de procesos de fondo (emisión fiscal,
webhooks). Sin esto, un cron que falla en prod pasa desapercibido.

Está **gated por `SENTRY_DSN`**: sin DSN el SDK queda **inerte** (no envía nada, no afecta a nada), igual
que las integraciones OAuth o Stripe. Por eso CI y dev no necesitan ninguna clave.

> Alcance de esta versión: **solo la API (backend)**, que es donde están los errores que importan. La
> instrumentación del **web** (errores de cliente) y los **logs estructurados** (pino) son el siguiente paso.

---

## Qué tienes que hacer tú (5 minutos)

1. **Crea una cuenta** en https://sentry.io (el plan gratis sobra para empezar).
2. **Crea un proyecto**: _Projects → Create Project_ → plataforma **Node.js** (puedes llamarlo `lawzora-api`).
   - Si te pregunta por un framework, elige **Node.js** genérico (no hace falta el wizard: ya está cableado).
3. **Copia el DSN** del proyecto: _Settings → Projects → lawzora-api → Client Keys (DSN)_. Es una URL del
   tipo `https://xxxxx@oYYYY.ingest.de.sentry.io/ZZZZ`.
4. **Ponlo como secret** en la API de Fly:
   ```powershell
   flyctl secrets set SENTRY_DSN="https://...tu-dsn..." -a lawzora-api
   ```
   (Al hacerlo, `lawzora-api` se redespliega y Sentry empieza a reportar.)

Eso es todo. Opcionalmente:

- `SENTRY_TRACES_SAMPLE_RATE` (0..1) para activar trazas de rendimiento (default 0 = solo errores).
  Súbelo con cuidado: las trazas pueden capturar datos sensibles.
- `SENTRY_RELEASE` con el SHA del deploy para agrupar errores por versión.

## Cómo comprobar que funciona

1. Tras poner el DSN y redeplegar, fuerza un error de prueba (o espera al primero real).
2. En Sentry → _Issues_ debe aparecer el evento con su stack trace y el entorno `production`.
3. Configura una **alerta** en Sentry (_Alerts → Create Alert_) para que te avise por email/Slack cuando
   entren errores nuevos — eso es lo que cierra el bucle de "enterarme cuando algo falla".

## Privacidad (RGPD / datos de despachos)

`sendDefaultPii: false`: Sentry **no** adjunta cabeceras, cookies, IP ni cuerpos de petición por defecto.
Mantenerlo así. Si en el futuro subes el sampling de trazas, revisa que no se filtren datos de clientes.
