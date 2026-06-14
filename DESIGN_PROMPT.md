# Prompt para Claude Design — UI de LegalFlow

> Copia todo lo de debajo de la línea y pégalo en Claude Design. Cuando vuelvas con el resultado
> (design system + pantallas), lo implementamos en `apps/web` con Next.js + Tailwind + shadcn/ui.

---

Diseña la interfaz completa de **LegalFlow**, un SaaS de gestión para despachos de abogados que
opera en **dos jurisdicciones**: **España** y **República Dominicana**. Necesito un **design
system** y las **pantallas clave**, pensados para implementarse con **Next.js (App Router) +
TailwindCSS + shadcn/ui** (usa componentes tipo shadcn: Button, Card, Table, Dialog, Sheet,
Tabs, Badge, Input, Select, DropdownMenu, Toast, Avatar, Skeleton).

## Marca y tono
- Sector legal: transmite **confianza, rigor y calma**, pero moderno (no anticuado como los players
  tradicionales). Limpio, mucho espacio en blanco, tipografía legible, densidad de datos media-alta.
- Paleta: un **azul/índigo profundo** como color primario (autoridad/confianza) + neutros (grises
  fríos) + acentos semánticos (verde éxito, ámbar aviso, rojo error). Define tokens para **modo
  claro y oscuro**.
- Tipografía: una sans moderna y legible (p. ej. Inter) con buena jerarquía. Números tabulares para
  importes y fechas.
- Define **design tokens** (color, espaciado, radios, sombras, tipografía) como variables CSS,
  compatibles con la convención de theming de shadcn/ui (`--background`, `--foreground`,
  `--primary`, etc.).

## Dos experiencias (roles)
1. **App del despacho (staff: Abogado / Admin)** — densa, orientada a productividad.
2. **Portal del cliente (rol Cliente)** — más simple, tranquilizadora, solo lectura + chat.
Diferéncialas visualmente (p. ej. el portal más espacioso y guiado) pero compartiendo el sistema.

## Requisitos transversales
- **Bilingüe es-ES / es-DO**: textos en español; prevé un **selector de idioma** y que los importes
  se muestren en **EUR** (España) o **DOP** (RD) según el despacho. Nada de strings "quemados".
- **Responsive** (desktop primero, pero usable en tablet/móvil).
- **Accesibilidad** AA: contraste, focos visibles, navegación por teclado, labels.
- Estados de **carga (skeletons)**, **vacío** y **error** para cada vista de datos.

## Pantallas a diseñar

### Autenticación
- **Login** (email + contraseña). 
- **Registro de despacho** (alta del tenant): nombre del despacho, **jurisdicción** (España/RD),
  **moneda** (EUR/DOP), identificador fiscal del despacho, y datos del primer usuario admin.

### App del despacho (staff)
- **App shell**: barra lateral de navegación (Dashboard, Clientes, Expedientes, Documentos, Tareas,
  Facturación), cabecera con buscador, **campana de notificaciones** (tiempo real), selector de
  idioma, menú de usuario.
- **Dashboard**: tarjetas resumen (expedientes activos, tareas/plazos próximos, facturación del mes),
  lista de **plazos procesales** próximos con urgencia, actividad reciente.
- **Clientes**: tabla (nombre, identificador fiscal, email, nº expedientes) con búsqueda y paginación;
  **alta/edición** en panel lateral con **validación del identificador fiscal en vivo** (NIF/CIF/NIE
  en ES, RNC/Cédula en RD) y un botón "Dar acceso al portal".
- **Expedientes (matters)**: tabla con estado (Abierto, En curso, En espera, Cerrado, Archivado) como
  **badges de color**; **ficha de expediente** con pestañas: Resumen, Documentos, Tareas, Tiempo,
  **Ledger/Costes**, Chat. Incluye control para **cambiar de estado** (máquina de estados) y asignar
  abogado responsable.
- **Documentos**: dentro del expediente — lista de documentos con sus **versiones** y **estado de
  revisión** (Pendiente, En revisión, Aprobado, Rechazado, Requiere cambios) como badges; acción de
  **subir versión** y **flujo de revisión** (aprobar/rechazar/pedir cambios con comentario).
- **Tareas**: lista filtrable por estado/asignado/expediente; **alta de tarea** y **alta de tarea
  desde un plazo procesal** (tipo de plazo + fecha de inicio + nº de días → fecha límite calculada).
  Resalta tareas vencidas/próximas.
- **Facturación (ledger + facturas)**: 
  - Vista de **ledger por expediente**: lista de movimientos (provisión, suplido, honorarios/horas,
    factura, cobro, ajuste) con su signo y un **saldo** destacado.
  - **Emitir factura**: selección de líneas (descripción, cantidad, precio, impuesto), opción de
    **retención IRPF** (solo ES); previsualización de **totales fiscales** (base, IVA/ITBIS,
    retención, total).
  - **Detalle de factura**: cabecera fiscal, líneas, totales, estado (Borrador/Emitida/Pagada), y un
    bloque del **registro de cumplimiento** (Verifactu en ES con su huella/QR; e-CF en RD); botón "Cobrar".

### Portal del cliente
- **Inicio del portal**: saludo, sus expedientes con estado, pendientes y un resumen de costes.
- **Detalle de expediente (cliente)**: estado, documentos (descarga), tareas/pendientes, **ledger
  transparente** (qué se ha provisionado/gastado/facturado) y **chat** con el despacho.
- **Sus facturas**: lista con estado e importes; detalle con totales fiscales.

### Componentes transversales
- **Panel/bandeja de notificaciones** (tiempo real).
- **Chat por expediente** (mensajes con autor y hora, en tiempo real).
- Tabla de datos reutilizable (orden, búsqueda, paginación, vacío/carga).
- Badges de estado coherentes (expediente, revisión de documento, factura, tarea).
- Formularios con validación y errores en línea.

## Entregables que necesito
1. **Design system**: tokens (claro/oscuro), tipografía, paleta semántica, y los componentes base
   listados (en clave shadcn/ui), con sus estados (hover/focus/disabled/loading).
2. **Mockups de alta fidelidad** de todas las pantallas anteriores (desktop + una muestra responsive).
3. Especificación suficiente para implementarlo con Tailwind + shadcn/ui (clases/variables, no solo
   imágenes): idealmente componentes/HTML+CSS o referencias a componentes shadcn concretos.
4. Patrones de **estado vacío, carga y error** y de **badges/estados**.

Prioriza que sea **implementable rápido** sobre shadcn/ui y fiel a un producto legal serio y moderno.
