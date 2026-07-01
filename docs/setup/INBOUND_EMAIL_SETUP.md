# Email-por-BCC al expediente

Archiva un correo en su expediente con solo **ponerlo en copia oculta (CCO/BCC)**. Cada expediente tiene
una dirección única (`archivar+<id>.<token>@in.lawzora.com`); un worker de correo entrante reenvía el
mensaje parseado a la API, que lo guarda como correspondencia del expediente.

Es una integración **gated**: sin configurar, el endpoint responde 404 y la dirección no se muestra. El
resto del producto no se ve afectado.

## Qué se ha entregado (ya en producción)

- Webhook `POST /api/inbound-email` (público, doble candado: cabecera `x-inbound-secret` + token por
  expediente) que crea un `MatterEmail` entrante. Resuelve el expediente del **token de la dirección**,
  no de un usuario.
- `GET /api/inbound-email/address/:matterId` (autenticado) → la dirección BCC del expediente.
- En la ficha del expediente (Correspondencia) aparece la dirección + botón **Copiar** cuando el
  conector está activo.
- Token por expediente con HMAC del `matterId` (no se puede falsificar ni adivinar sin el secreto).

## Activación (pasos para ti)

### 1. Secretos en la API

```bash
flyctl secrets set -c fly.api.toml \
  INBOUND_EMAIL_ENABLED=true \
  INBOUND_EMAIL_SECRET="<cadena-larga-aleatoria>" \
  INBOUND_EMAIL_DOMAIN="in.lawzora.com"
```

`INBOUND_EMAIL_SECRET` cumple doble función: firma los tokens por expediente **y** es el secreto que el
worker manda en la cabecera `x-inbound-secret`. Guárdalo bien.

### 2. Subdominio de correo entrante (Cloudflare Email Routing)

1. En Cloudflare, dominio `lawzora.com` → **Email → Email Routing**. Añade el subdominio `in.lawzora.com`
   (o usa un dominio dedicado) y publica los registros MX que indica Cloudflare.
2. Crea una **regla catch-all** para `in.lawzora.com` que ejecute un **Email Worker**.
3. El Worker reenvía a la API. Ejemplo mínimo:

   El worker manda el **MIME crudo completo** (`message/rfc822`) para que la API archive el cuerpo
   íntegro y los adjuntos; reenvía a Gmail todo lo que no sea `archivar+` para no romper el correo normal:

   ```js
   export default {
     async email(message, env) {
       const to = message.to || '';
       if ((to.split('@')[0] || '').startsWith('archivar+')) {
         await fetch('https://api.lawzora.com/api/inbound-email', {
           method: 'POST',
           headers: {
             'content-type': 'message/rfc822',
             'x-inbound-secret': env.INBOUND_SECRET,
             'x-envelope-to': to,
             'x-envelope-from': message.from,
           },
           body: message.raw, // stream del MIME completo (cuerpo + adjuntos)
         });
         return;
       }
       await message.forward('TU-CORREO@gmail.com'); // resto → tu bandeja de siempre
     },
   };
   ```

   Pon `INBOUND_SECRET` en el Worker con el mismo valor que `INBOUND_EMAIL_SECRET`. El cuerpo completo
   queda en la correspondencia del expediente (desplegable) y cada **adjunto** se sube como documento
   cifrado del expediente (atribuido a su letrado).

### 3. Probar

1. En un expediente, copia su dirección BCC (Correspondencia → "Copiar").
2. Envía o reenvía un correo poniéndola en **CCO**.
3. El correo aparece como entrante en la correspondencia del expediente.

## Notas de seguridad

- El token por expediente evita que alguien archive correos en un expediente ajeno aunque conozca el
  `matterId`. La cabecera `x-inbound-secret` evita que se llame al webhook sin pasar por el worker.
- El correo se inserta con el cliente del sistema (BYPASSRLS) usando el `tenantId` del expediente resuelto
  por el token — nunca cruza despachos.
- Sólo se guarda asunto + un extracto del cuerpo (300 caracteres) como `MatterEmail`. Adjuntar el cuerpo
  completo o los ficheros queda como ampliación.
