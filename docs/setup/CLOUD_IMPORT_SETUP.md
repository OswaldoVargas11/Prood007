# Importar ficheros desde la nube (Google Drive · OneDrive · SharePoint)

Esta función añade un botón **«Importar de la nube»** al subir documentos a un expediente. El usuario
elige un fichero en su almacenamiento (Google Drive, OneDrive o SharePoint) y **el servidor descarga los
bytes** y los guarda en el expediente pasando por el **mismo pipeline cifrado** que una subida normal
(cifrado AES-256, hash SHA-256, versionado, revisión, auditoría). El fichero queda bajo tu control: no es
un enlace, es una copia con cadena de custodia.

Reutiliza la conexión OAuth que ya configuras en [`GOOGLE_OAUTH_SETUP.md`](./GOOGLE_OAUTH_SETUP.md) y
[`MICROSOFT_OAUTH_SETUP.md`](./MICROSOFT_OAUTH_SETUP.md). Aquí solo se documenta **lo añadido** para
importar ficheros.

La función está **gated**: si falta cualquier pieza de configuración, el proveedor correspondiente no
aparece en el diálogo de importación y nada se rompe.

---

## 1. Google Drive

### Por qué este enfoque (sin evaluación CASA)

Se usa el **scope `drive.file`** (NO `drive.readonly`). `drive.file` solo da acceso a los ficheros que el
propio usuario elige en el **Google Picker**, no a todo su Drive. Por eso **no** es un scope restringido y
la app se publica **sin** la evaluación de seguridad CASA (cara y lenta). El selector lo pinta Google en
el navegador; nuestro servidor descarga el fichero elegido con su token.

### Pasos en Google Cloud Console

Sobre el **mismo proyecto OAuth** que ya creaste para Calendar/Gmail:

1. **Habilita dos APIs** en _APIs y servicios → Biblioteca_:
   - **Google Picker API**
   - **Google Drive API**
2. **Crea una clave de API** (_APIs y servicios → Credenciales → Crear credenciales → Clave de API_).
   - Restríngela a la **Picker API** y a tu dominio web (HTTP referrers) por seguridad.
   - Este valor → `GOOGLE_PICKER_API_KEY`.
3. **Apunta el número de proyecto** (_Configuración del proyecto → Número de proyecto_, son dígitos).
   - Este valor → `GOOGLE_PROJECT_NUMBER` (es el `appId` del Picker).
4. En la **pantalla de consentimiento OAuth**, añade el scope
   `https://www.googleapis.com/auth/drive.file` a la lista de scopes de la app.
5. En el **client OAuth de tipo Web**, asegúrate de que en _Authorized JavaScript origins_ está la URL del
   web (p. ej. `https://lawzora.com`) — el Picker se abre desde el navegador.

### Variables de entorno (API)

```bash
GOOGLE_PICKER_API_KEY="AIza...."     # clave de navegador con la Picker API habilitada
GOOGLE_PROJECT_NUMBER="123456789012" # número del proyecto de Google Cloud (appId)
```

(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` y `DATA_ENCRYPTION_KEY` ya deberían
estar puestas para Calendar/Gmail.)

### Reconexión de usuarios ya conectados ⚠️

Al añadir el scope `drive.file`, la pantalla de consentimiento cambia. Los usuarios que **ya** conectaron
Google (para Calendar/Gmail) deben **reconectar una vez** desde _Ajustes → Integraciones_ para conceder
Drive. No pierden Calendar/Gmail (se usa `include_granted_scopes`). Hasta que reconecten, el diálogo les
mostrará «Conecta Google en Ajustes para usarlo» en la opción de Drive.

---

## 2. OneDrive y SharePoint (Microsoft 365)

### Enfoque

Se navega el contenido desde un **explorador propio** (no un selector embebido), usando Microsoft Graph
desde el servidor. Scopes añadidos:

- **`Files.Read`** → OneDrive del usuario. **No** requiere consentimiento de administrador.
- **`Sites.Read.All`** → bibliotecas de **SharePoint**. En muchos tenants **requiere que un administrador
  de Entra ID conceda el consentimiento una sola vez** (para toda la organización).

### Pasos en Entra ID (Azure) — App registrations

Sobre la **misma app** que registraste para Outlook:

1. _API permissions → Add a permission → Microsoft Graph → Delegated permissions_, añade:
   - `Files.Read`
   - `Sites.Read.All`
2. Si tu organización lo exige, pulsa **«Grant admin consent for <tenant>»** (necesario sobre todo para
   `Sites.Read.All`). Sin esto, OneDrive puede funcionar pero SharePoint dará error de permisos.
3. No hacen falta variables nuevas: se reutilizan `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI`,
   `MS_TENANT` y `DATA_ENCRYPTION_KEY`.

### Reconexión de usuarios ya conectados ⚠️

Igual que con Google: los scopes de la conexión cambian, así que quien ya tenga Microsoft conectado debe
**reconectar una vez** desde _Ajustes → Integraciones_ para conceder el acceso a ficheros.

---

## 3. Cómo se usa (UI)

En un expediente → pestaña **Documentos** → botón **«Importar de la nube»**:

- **Google Drive** → abre el Google Picker; al elegir un fichero, se importa.
- **OneDrive** → explorador de carpetas del OneDrive del usuario.
- **SharePoint** → buscador de sitios → biblioteca del sitio → explorador de carpetas.

Notas de comportamiento:

- **Límite de tamaño**: 25 MB (igual que la subida directa).
- **Documentos nativos de Google** (Docs/Sheets/Slides) se **exportan** automáticamente a formato
  ofimático (Docs→`.docx`, Sheets→`.xlsx`, Slides→`.pptx`) al importarlos.
- Cada importación queda en el **registro de auditoría** como `document.imported_from_cloud` con el
  proveedor.

---

## 4. Comprobación rápida

1. Pon las variables y reinicia la API.
2. En _Ajustes → Integraciones_, conecta (o reconecta) Google y/o Microsoft.
3. Entra en un expediente → Documentos → **Importar de la nube**: deben aparecer los proveedores
   configurados y conectados.
4. Importa un fichero y verifica que aparece como documento nuevo (versión 1) y que se puede descargar.

### Disponible solo para personal del despacho

La importación está restringida a roles **FIRM_ADMIN** y **LAWYER** (igual que la subida de documentos).
El portal del cliente **no** ofrece importación de la nube en esta versión.
