# Activar la integración con Google (Calendar + Gmail)

La integración ya está construida y desplegada, pero **apagada** (gated) hasta que
crees la app OAuth de Google y pegues las credenciales. Mientras falten, la app
responde "no configurado" y no afecta a nada.

Esto lo tienes que hacer **tú** (Anthropic/Claude no puede crear apps en Google Cloud).

## 1. Crear el proyecto y habilitar APIs

1. Entra en https://console.cloud.google.com/ y crea (o elige) un proyecto, p. ej. "Lawzora".
2. **APIs y servicios → Biblioteca** y habilita:
   - **Google Calendar API**
   - **Gmail API**

## 2. Pantalla de consentimiento OAuth

1. **APIs y servicios → Pantalla de consentimiento OAuth** → tipo **Externo**.
2. Nombre de la app: `Lawzora`. Correo de asistencia y de contacto: el tuyo.
3. **Scopes** (permisos) — añade:
   - `openid`, `email`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
4. Deja la app en modo **"Pruebas" (Testing)** y añade como **usuarios de prueba**
   los correos de los despachos que vayan a usarlo (hasta 100). En este modo
   funciona ya, sin esperar a la verificación de Google.

> ⚠️ **Importante sobre `gmail.readonly`**: es un scope _restringido_ de Google.
> Para producción abierta (más de 100 usuarios) Google exige verificación de la app
> y una evaluación de seguridad (CASA). Para el piloto/demo basta el modo "Pruebas"
> con usuarios de prueba. `calendar.events` y `gmail.send` son _sensibles_ (solo
> requieren verificación, sin evaluación de seguridad). Verás un aviso de "app no
> verificada" que los usuarios de prueba pueden saltar con "Continuar".

## 3. Crear las credenciales OAuth

1. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente OAuth**.
2. Tipo de aplicación: **Aplicación web**.
3. **URI de redireccionamiento autorizado** (exacto, sin barra final):

   ```
   https://api.lawzora.com/api/integrations/google/callback
   ```

4. Guarda y copia el **ID de cliente** y el **Secreto de cliente**.

## 4. Pegar las credenciales en el servidor (Fly)

Desde tu máquina con `fly auth login` hecho:

```bash
fly secrets set \
  GOOGLE_CLIENT_ID="TU_CLIENT_ID.apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="TU_CLIENT_SECRET" \
  GOOGLE_REDIRECT_URI="https://api.lawzora.com/api/integrations/google/callback" \
  -a lawzora-api
```

`DATA_ENCRYPTION_KEY` y `JWT_ACCESS_SECRET` ya están puestos (los tokens se cifran
con el primero). Tras el reinicio de la máquina, la integración queda activa.

## 5. Probar

1. En la app: **Ajustes → Google Calendar → Conectar Google** → consientes en Google.
2. Vuelves a Ajustes con "Google conectado". Pulsa **Sincronizar agenda ahora**:
   los plazos del despacho aparecen como eventos en tu Google Calendar.
3. En un **expediente → pestaña "Correos"**: **Enviar correo** (sale desde tu Gmail
   y queda archivado) y **Adjuntar de la bandeja** (archiva un correo recibido).

## Qué hace cada parte (recordatorio)

- **Calendar**: empuje de plazos Lawzora → Google (una dirección). El feed iCal de
  "Suscribir agenda" sigue disponible y no necesita OAuth.
- **Gmail**: enviar desde el expediente (`gmail.send`) y adjuntar correos de la
  bandeja (`gmail.readonly`). Todo queda registrado en el expediente (`MatterEmail`).
- Tokens **cifrados en reposo** (AES-256-GCM). Una conexión por usuario; se puede
  **desconectar** desde Ajustes.
