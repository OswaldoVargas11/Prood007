# Add-in de Word — «Guardar al expediente»

Add-in de panel de tareas para Microsoft Word que permite, sin salir de Word, iniciar sesión en
Lawzora, elegir un expediente y **guardar el documento actual (.docx) en ese expediente**.

Es un complemento estándar de Office (Office.js). No requiere instalar nada en el servidor: el panel
es estático y se sirve desde la propia web (`https://lawzora.com/word-addin/taskpane.html`); habla con
la API de producción (`https://api.lawzora.com`).

## Qué se ha entregado (ya en producción)

- `apps/web/public/word-addin/taskpane.html` — panel de tareas (login + lista de expedientes + guardar).
- `apps/web/public/word-addin/manifest.xml` — manifiesto del complemento.
- Excepción de cabeceras en `apps/web/next.config.mjs`: `/word-addin/*` permite el _framing_ de Office
  (el resto del sitio mantiene `frame-ancestors 'none'`).

## Cómo probarlo (sideload, sin publicar en AppSource)

### Word de escritorio (Windows)

1. Crea (o usa) un recurso compartido de red y copia ahí `manifest.xml`. Por ejemplo `\\TU-PC\addins`.
   - Comparte la carpeta: clic derecho → _Propiedades_ → _Compartir_.
2. En Word: **Archivo → Opciones → Centro de confianza → Configuración del Centro de confianza →
   Catálogos de complementos de confianza**. Pega la ruta UNC del recurso compartido (`\\TU-PC\addins`),
   marca _Mostrar en menú_ y acepta. Reinicia Word.
3. **Insertar → Mis complementos → Carpeta compartida (SHARED FOLDER) → Lawzora**.
4. Se abre el panel: inicia sesión, elige expediente y pulsa _Guardar el documento actual al expediente_.

### Word en la web

1. Abre un documento en Word para la web.
2. **Inicio → Complementos → Más complementos → Mis complementos → Cargar mi complemento** y sube el
   `manifest.xml`.
3. Igual que arriba.

### Microsoft 365 admin (despliegue a todo el despacho)

En el **Centro de administración de Microsoft 365 → Configuración → Aplicaciones integradas →
Cargar aplicación personalizada**, sube `manifest.xml` y asígnalo a los usuarios/grupos. Así aparece
automáticamente en el Word de todos sin sideload manual.

## Notas y límites conocidos

- **Doble factor / multi-despacho:** el panel usa `POST /api/auth/login` y espera `accessToken`. Si la
  cuenta tiene MFA o el mismo email existe en varios despachos, el login simple no basta; en ese caso
  inicia sesión primero en la web. (Mejora futura: flujo OAuth/ticket como el de la web).
- **Icono:** el manifiesto apunta a `https://lawzora.com/favicon.ico`. Para una imagen nítida en la
  cinta, sustitúyelo por un PNG de 32/64/80 px y actualiza `IconUrl`.
- **GUID:** el `Id` del manifiesto es fijo. Si publicas varias variantes (p. ej. una de pruebas),
  genera un GUID distinto por cada una.
- El add-in sube el `.docx` tal cual a `POST /api/documents` con `matterId` + `name` (mismo endpoint que
  la subida web), así que hereda permisos, RLS y almacenamiento cifrado en R2.

## Outlook (siguiente paso, no incluido aquí)

El mismo enfoque sirve para un add-in de Outlook («archivar este correo al expediente»): cambia
`<Host Name="Document" />` por `Mailbox`, usa `Office.context.mailbox.item` para extraer el correo y
publícalo en el expediente. Queda como ampliación.
