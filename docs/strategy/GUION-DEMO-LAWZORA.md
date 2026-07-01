# Guion de demo — Lawzora (recorrido completo)

> **Cuenta demo (prod):** `demo@demo.lawzora` / `Lawzora.Demo-2026!` en https://lawzora.com/es/login
> **Duración sugerida:** 20-30 min. **Hilo narrativo:** un despacho transaccional real gestionando su día y una operación de M&A de principio a fin.
> Cada sección: **[Mostrar]** lo que se ve · **[Decir]** el mensaje de venta.

---

## Acto 0 — Antes de entrar (opcional, 1 min)

- **[Mostrar]** La página pública **https://lawzora.com/es/precios** (accesible sin login).
- **[Decir]** "Tarifa clara, sin llamada de ventas: 3 planes × ES/RD × mensual/anual/bienal, y un cupo Fundador. Verás que el pitch es 'facturar en regla' — cumplimiento fiscal nativo, no un añadido."

## Acto 1 — Panel (el 'cockpit' del despacho)

Sidebar → **Panel**.

- **[Mostrar]** KPIs del despacho, el **resumen del día generado con IA**, próximos vencimientos, actividad reciente, tarjeta de "primeros pasos".
- **[Decir]** "Lo primero que ve el letrado por la mañana: qué vence hoy, qué necesita su atención, un resumen redactado por el asistente. El panel es personalizable por widgets."

## Acto 2 — Clientes

Sidebar → **Clientes**.

- **[Mostrar]** Listado con búsqueda, ficha de un cliente (datos fiscales ES/RD, clasificación B2B/B2C, domicilio fiscal), expedientes y facturas vinculados.
- **[Decir]** "Multi-jurisdicción de verdad: cada cliente lleva su identificador fiscal, sus impuestos y su factura electrónica según país. Base de la aceptación legal (clickwrap) y de la secretaría corporativa."

## Acto 3 — Expedientes (el corazón) 🎯

Sidebar → **Expedientes** → abre la operación insignia **"Adquisición de TechFlow, S.L. (compraventa de participaciones)"**: https://lawzora.com/es/matters/cmr1xo0p60015v5kd3bx2psgf
Recorre **todas** las subtabs en orden:

1. **Resumen** — [Mostrar] estado, partes, responsable, próximos hitos, contadores. [Decir] "Vista 360º de la operación de un vistazo."
2. **Documentos** — [Mostrar] árbol de **carpetas** (Corporate/Financiero/Contratos), **versionado**, subida drag&drop, firma. [Decir] "Documentos organizados por carpetas, con versiones e integración con Word/Outlook (add-ins)."
3. **Requisitos** (checklist del tipo de gestión) — [Mostrar] los requisitos aplicados al expediente, algunos cumplidos. [Decir] "Cada tipo de asunto trae su checklist; nada se olvida."
4. **Operación** ⭐ (deal cockpit — el diferenciador) — [Mostrar]:
   - **Working group / partes**: comprador, vendedor, asesores legales, financiero, notario.
   - **Calendario de operación / hitos**: SIGNING, CLOSING y sobre todo el **longstop** con su alerta de plazo (T-3).
   - **Disclosure schedules** (R&W), **registros** (Mercantil/RD).
   - **Funds Flow & Escrow** (T-1): flujo de fondos que **cuadra por moneda** + ledger de escrow con importes y una liberación; export del closing statement en PDF.
   - [Decir] "Esto es lo que ningún practice-management generalista tiene: la **mecánica del cierre** — quién paga qué, qué se retiene en escrow, qué condiciones faltan. Es el primer artefacto que busca un abogado de M&A."
5. **Cierre** (closing checklist + readiness, T-2) — [Mostrar] items **Conditions Precedent / Deliverable / Signature** por fase, y el indicador **"Listo para firmar: X/Y CPs satisfechas"**; botón de **closing binder** (ZIP). [Decir] "El checklist se convierte en una máquina de estado del cierre: no dejas firmar con condiciones sin cumplir."
6. **Data room** — [Mostrar] carpetas, **grupos** de acceso, **enlace mágico** externo con marca de agua, Q&A. [Decir] "Due diligence con data room propio: la contraparte entra por enlace, sin cuentas, con watermark y trazabilidad."
7. **Provisión** — [Mostrar] provisión de fondos / caja del asunto. [Decir] "Provisiones y suplidos ligados al expediente."
8. **Costes** — [Mostrar] rentabilidad del asunto (horas, tarifas, margen). [Decir] "Sabes si el asunto es rentable, no solo cuánto facturaste."
9. **Tareas** — [Mostrar] tareas del expediente (kanban), plantillas de tarea. [Decir] "El trabajo operativo, ligado al asunto."
10. **Facturación** — [Mostrar] facturas del expediente (Verifactu/e-CF), estado. [Decir] "Facturas fiscales encadenadas emitidas desde el propio asunto."
11. **Correos** — [Mostrar] correos vinculados (BCC/inbound al expediente). [Decir] "El correo del caso queda en el expediente, no perdido en una bandeja."
12. **Chat** — [Mostrar] conversación del asunto (reacciones, adjuntos). [Decir] "Comunicación interna del equipo por asunto."
13. **Actividad** — [Mostrar] timeline inmutable de todo lo ocurrido. [Decir] "Auditoría por expediente: trazabilidad total."
14. **Asistente IA** (Zora) — [Mostrar] pregunta al agente sobre el asunto (con **RAG citable**), y el **botón Stop**; enseña un **workflow** multi-paso. [Decir] "Zora responde con citas a los documentos del asunto, ejecuta herramientas con confirmación, y puedes encadenar flujos. Y sí, puedes pararla en caliente."

## Acto 4 — Documentación

Sidebar → **Documentos** (global), **Plantillas**, **Presentaciones**.

- **[Mostrar]** búsqueda documental global, biblioteca de **cláusulas** y **snippets**, plantillas de documento, generador de presentaciones.
- **[Decir]** "Todo el conocimiento del despacho reutilizable: cláusulas, plantillas, snippets de correo."

## Acto 5 — Finanzas

Sidebar → **Facturación / Facturas / Informes**.

- **[Mostrar]** emisión de factura (Verifactu ES / e-CF RD con su QR/eNCF, **registro encadenado**), estados, cobro online (Stripe), dunning; **informes** de rentabilidad.
- **[Decir]** "Factura electrónica de serie: registro fiscal encadenado y conforme; la transmisión a AEAT/DGII se activa en el onboarding fiscal. Cobro online integrado."

## Acto 6 — Comunicación

Sidebar → **Agenda**, **Citas**, **Mensajes**, **Notificaciones (LexNET)**.

- **[Mostrar]** agenda "Hoy" (con Google Calendar), reserva de citas, **dock de mensajería** del despacho (presencia, DM, canal General), y **LexNET-lite** de notificaciones.
- **[Decir]** "El despacho comunicado: agenda sincronizada, chat interno tipo Slack, y las notificaciones judiciales en un sitio."

## Acto 7 — Despacho (administración)

Sidebar → **Aprobaciones**, **Auditoría**, **AML/Captación**, **Importar**, **Suscripción**, **Ajustes**, **Portal del cliente**.

- **[Mostrar]**:
  - **Auditoría**: registro **inmutable (append-only)** de acciones — vender la confianza/seguridad.
  - **AML / Captación (leads)**: formulario público de intake + verificación.
  - **Importar**: traer expedientes desde Drive/OneDrive/SharePoint.
  - **Ajustes**: multi-letrado/roles, plantillas, certificados fiscales, integraciones (Google/Microsoft).
  - **Portal del cliente**: entra como cliente (portal) — subida de documentos, justificantes, estado de sus asuntos.
- **[Decir]** "Gobierno del despacho: seguridad auditada e inmutable, cumplimiento AML, migración desde tu nube actual, y un portal para que el cliente colabore."

## Cierre (30 s)

- **[Decir]** "En una frase: Lawzora lleva el despacho **y** la operación — desde el lead hasta el closing binder — con cumplimiento fiscal ES/RD nativo, un data room propio, la mecánica de cierre que nadie más tiene, y un asistente de IA que cita tus documentos. Todo en una herramienta, sin integraciones a medias."

---

### Notas para quien presenta

- Empieza por **Panel → Clientes → Expedientes** (el 80% del wow está en la subtab **Operación** y **Cierre**).
- Si el tiempo aprieta: Panel (1') → Operación (5') → Cierre (2') → Data room (2') → Facturación (2') → Auditoría (1').
- Las secciones fiscales de transmisión (AEAT/DGII) y algunos glosarios RD están **gated**/pendientes de certificado — no prometas transmisión inmediata; di "se activa en el onboarding fiscal".
