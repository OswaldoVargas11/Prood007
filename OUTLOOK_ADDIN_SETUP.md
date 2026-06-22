# Add-in de Outlook — «Archivar al expediente»

Add-in de panel de tareas para Microsoft Outlook que permite, sin salir de Outlook, iniciar sesión en
Lawzora, elegir un expediente y **archivar el correo abierto** (asunto + remitente + fecha + cuerpo)
como documento en ese expediente.

Es un complemento de correo estándar de Office.js, modo lectura. No requiere backend nuevo: el panel es
estático y se sirve desde la web (`https://lawzora.com/outlook-addin/taskpane.html`); el correo se sube
a `POST /api/documents` (mismo endpoint, RLS y cifrado en R2 que la subida web). El espejo del add-in de
Word, ver [[WORD_ADDIN_SETUP.md]].

## Qué se ha entregado (ya en producción)

- `apps/web/public/outlook-addin/taskpane.html` — panel (login + expediente + archivar el correo abierto).
- `apps/web/public/outlook-addin/manifest.xml` — manifiesto de complemento de correo (modo lectura de mensajes).
- Excepción de cabeceras en `apps/web/next.config.mjs`: `/outlook-addin/*` permite el _framing_ de Office.

## Cómo probarlo (sideload, sin publicar en AppSource)

### Outlook en la web / Outlook nuevo

1. Abre Outlook en la web → **Configuración (engranaje) → General → Administrar complementos** (o
   directamente https://aka.ms/olksideload). Se abre el diálogo de complementos.
2. **Mis complementos → Complemento personalizado → Agregar desde un archivo** y sube el `manifest.xml`.
3. Abre un correo. En la barra del mensaje (menú **…** / «Aplicaciones») aparece **Lawzora — Archivar al
   expediente**. Ábrelo, inicia sesión, elige expediente y pulsa _Archivar este correo_.

### Outlook de escritorio (Windows/Mac)

Mismo diálogo: **Inicio → Obtener complementos → Mis complementos → Complemento personalizado → Agregar
desde un archivo** → `manifest.xml`. El botón aparece al abrir un correo.

### Microsoft 365 admin (despliegue a todo el despacho)

**Centro de administración de Microsoft 365 → Configuración → Aplicaciones integradas → Cargar aplicación
personalizada** → sube `manifest.xml` y asígnalo a usuarios/grupos. Aparece automáticamente en el Outlook
de todos sin sideload manual.

## Notas y límites conocidos

- **Qué se archiva:** asunto, remitente, fecha y el **cuerpo en texto plano** del correo, como un `.txt`.
  Los adjuntos del correo **no** se suben (requeriría EWS/Graph; queda como ampliación).
- **Doble factor / multi-despacho:** el panel usa `POST /api/auth/login` y espera `accessToken`. Con MFA
  o el mismo email en varios despachos, el login simple no basta; inicia sesión primero en la web.
  (Mejora futura: flujo OAuth/ticket como el de la web).
- **Permisos del manifiesto:** `ReadItem` (solo lectura del correo). No escribe ni envía nada por Outlook.
- **Icono / GUID:** igual que en Word — el `IconUrl` apunta al favicon (sustituible por un PNG) y el `Id`
  es un GUID fijo distinto al del add-in de Word.

## Relación con el add-in de Word

Comparten enfoque y panel casi idéntico (login + elegir expediente + subir a `/api/documents`). La
diferencia es la fuente del archivo: Word sube el `.docx` actual; Outlook arma un `.txt` desde el correo
abierto. Si más adelante quieres archivar el `.eml` íntegro o los adjuntos, se añade leyendo el mensaje
por Microsoft Graph con el token del usuario.
