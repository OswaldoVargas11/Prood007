# Activar la integración con Microsoft 365 (Outlook Calendar + correo)

Espejo de la de Google sobre Microsoft Graph. Ya está construida y desplegada, pero
**apagada** (gated) hasta que registres la app en Azure y pegues las credenciales.
Mientras falten, responde "no configurado" y no afecta a nada.

Esto lo tienes que hacer **tú** (Claude no puede registrar apps en Azure).

## 1. Registrar la app en Azure (Microsoft Entra ID)

1. https://portal.azure.com → **Microsoft Entra ID** → **Registros de aplicaciones** →
   **Nuevo registro**.
2. Nombre: `Lawzora`.
3. Tipos de cuenta admitidos: **Cuentas en cualquier directorio organizativo y cuentas
   personales de Microsoft** (corresponde al tenant `common`).
4. **URI de redireccionamiento** → plataforma **Web**:

   ```
   https://api.lawzora.com/api/integrations/microsoft/callback
   ```

5. Registrar. Copia el **Id. de aplicación (cliente)**.

## 2. Secreto de cliente

**Certificados y secretos** → **Nuevo secreto de cliente** → copia el **Valor**
(no el Id.) en cuanto se cree; luego se oculta.

## 3. Permisos de API (Microsoft Graph, delegados)

**Permisos de API** → **Agregar permiso** → **Microsoft Graph** → **Permisos
delegados** → añade:

- `openid`, `email`, `offline_access`
- `Calendars.ReadWrite`
- `Mail.Send`
- `Mail.Read`

Son permisos que el propio usuario consiente al conectar; no requieren consentimiento
de administrador salvo que la política del tenant lo exija.

## 4. Pegar las credenciales en el servidor (Fly)

```bash
fly secrets set \
  MS_CLIENT_ID="TU_APPLICATION_CLIENT_ID" \
  MS_CLIENT_SECRET="TU_SECRET_VALUE" \
  MS_REDIRECT_URI="https://api.lawzora.com/api/integrations/microsoft/callback" \
  -a lawzora-api
```

`MS_TENANT` es opcional (por defecto `common`, que admite cuentas de trabajo y
personales). Si quieres restringir a tu organización, ponlo al Id. de tu tenant.
`DATA_ENCRYPTION_KEY`/`JWT_ACCESS_SECRET` ya están puestos.

## 5. Probar

1. **Ajustes → Microsoft 365 (Outlook) → Conectar** → consientes en Microsoft.
2. **Sincronizar agenda ahora**: los plazos aparecen en tu Outlook Calendar.
3. **Expediente → pestaña "Correos"**: enviar y adjuntar funciona con la cuenta
   conectada (Google o Microsoft, la que tengas). La pestaña es neutral de proveedor.

## Notas

- La pestaña "Correos" usa rutas neutrales (`/integrations/mail/*`) que despachan al
  proveedor conectado. Si conectas ambos, gana el conectado más recientemente.
- El push de agenda a Outlook es idempotente (marca cada evento con el id de la tarea
  mediante una propiedad extendida de Graph).
- Tokens cifrados en reposo (AES-256-GCM). Conexión por usuario; se desconecta desde
  Ajustes. Ver también `GOOGLE_OAUTH_SETUP.md`.
