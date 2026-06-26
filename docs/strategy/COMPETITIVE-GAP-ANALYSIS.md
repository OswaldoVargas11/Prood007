# Análisis Competitivo y de Gaps

> Documento vivo del programa de mejora continua — generado 2026-06-27.

Este documento posiciona **Lawzora** (antes "LegalFlow") frente a las plataformas de referencia en legal-tech para despachos, identifica diferenciadores defendibles y los huecos a cerrar, y articula la tesis de valor para una operación de venta de IP o adquisición estratégica.

## 1. Mapa competitivo

- **Clio (US/global)** — líder de practice management cloud, ecosistema de integraciones (App Directory) y marca consolidada; no fiscal ES/RD.
- **Aranzadi / Kleos (Wolters Kluwer, ES)** — gestión de despacho con el activo diferencial del **contenido jurídico** (jurisprudencia, legislación, formularios) integrado.
- **Lefebvre (ES)** — fuerte en contenido y bases de datos jurídicas (Memento), con módulos de gestión.
- **Filevine (US)** — practice/case management orientado a litigio y volumen, con automatización; mercado US.
- **Software local RD** — soluciones de facturación/gestión locales, normalmente sin cloud moderno, sin IA ni transaccional, pero con conocimiento del e-CF DGII.
- **Lawzora** — SaaS vertical **multi-jurisdicción ES + RD** con compliance fiscal de e-invoicing, módulo transaccional/M&A e IA integrada, en producción y pre-revenue.

## 2. Tabla comparativa por capacidad

Leyenda: `OK` = cubierto · `~` = parcial/limitado · `—` = ausente · `★` = diferenciador de Lawzora · `▼` = donde Lawzora pierde.

| Capacidad                                    | Clio | Aranzadi/Kleos (WK ES) | Lefebvre (ES) | Filevine (US) | Software local RD | **Lawzora** |
| -------------------------------------------- | ---- | ---------------------- | ------------- | ------------- | ----------------- | ----------- |
| Gestión de despacho                          | OK   | OK                     | OK            | OK            | ~                 | **OK**      |
| Facturación + control horario                | OK   | OK                     | ~             | OK            | ~                 | **OK**      |
| Compliance fiscal ES (Verifactu/TicketBAI)   | —    | ~                      | ~             | —             | —                 | **OK ★**    |
| Compliance fiscal RD (e-CF DGII end-to-end)  | —    | —                      | —             | —             | ~                 | **OK ★**    |
| Multi-jurisdicción ES + RD                   | —    | —                      | —             | —             | —                 | **OK ★**    |
| Módulo transaccional / M&A                   | —    | ~                      | ~             | —             | —                 | **OK ★**    |
| IA integrada                                 | OK   | ~                      | ~             | OK            | —                 | **OK**      |
| Portal de cliente                            | OK   | ~                      | ~             | OK            | —                 | **OK**      |
| Firma electrónica (Signaturit)               | OK   | ~                      | ~             | OK            | —                 | **OK**      |
| Importación nube (Drive/OneDrive/SharePoint) | OK   | ~                      | —             | ~             | —                 | **OK**      |
| Chat interno                                 | ~    | —                      | —             | ~             | —                 | **OK**      |
| Add-ins Word/Outlook                         | ~    | OK                     | OK            | ~             | —                 | **OK**      |
| Bases de datos jurídicas / contenido legal   | —    | OK                     | OK            | —             | —                 | **— ▼**     |
| Ecosistema / marketplace                     | OK   | ~                      | ~             | OK            | —                 | **— ▼**     |
| App móvil nativa                             | OK   | OK                     | ~             | OK            | —                 | **~ ▼**     |
| Base instalada / marca                       | OK   | OK                     | OK            | OK            | ~                 | **— ▼**     |

## 3. Lectura del posicionamiento

### Diferenciadores defendibles (★)

- **e-CF DGII RD end-to-end** — superficie fiscal dominicana (motor de firma XML-DSig, semilla→token→recepción→estado, custodia del `.p12` cifrado por despacho, estado e-CF en factura) que ningún competidor ES/US ofrece y que el software local RD no acompaña con un producto moderno. _Nota: el registro fiscal se construye; la transmisión real a AEAT/DGII queda diferida a la subida del certificado por el owner._
- **Multi-jurisdicción ES + RD en un solo producto** — un único catálogo de dominio sirve ambas realidades fiscales y operativas. Es estructuralmente difícil de replicar para un incumbente anclado a una sola jurisdicción.
- **Módulo transaccional / M&A** — data room, signing/closing + escrow, working group, disclosure schedules y calendario de operación. Capacidad de gama alta ausente en practice management generalista.

### Donde Lawzora pierde (▼)

- **Contenido jurídico** — es el foso de **Aranzadi y Lefebvre**: jurisprudencia, legislación y formularios propietarios construidos durante décadas. Lawzora **no debe** intentar replicarlo.
- **Ecosistema / marketplace y marca** — **Clio** domina por App Directory y notoriedad; Lawzora parte de cero.
- **Base instalada** — Lawzora es esencialmente **pre-revenue**: sin base significativa de clientes de pago. Es el gap más material para un comprador, y a la vez la razón del descuento de entrada.

## 4. Estrategia de cierre de gaps

### Construir (núcleo, donde el foso crece con el código)

- **Cerrar la transmisión fiscal real** (XAdES e-CF / firma + remisión Verifactu) una vez disponible el certificado: convierte el "compliance construido" en "compliance certificado", el mayor multiplicador de valor.
- **Profundizar transaccional e IA** sobre la base ya en producción (RAG con Voyage + similitud coseno, asistente, resúmenes, plantillas), apalancando el CI estricto (cobertura ≥90%, RLS con Postgres real, conformance fiscal golden-file) como prueba de madurez en due-diligence.
- **App móvil nativa** sólo si el segmento objetivo lo exige; hoy PWA + dictado cubre el grueso.

### Partnerizar (comprar el foso ajeno en vez de excavar el propio)

- **Contenido jurídico** — integrar vía partnership/licencia con un proveedor de bases de datos en lugar de producirlo. Cierra el gap ▼ sin años de coste hundido.
- **Marketplace** — abrir API/integraciones de terceros antes que construir un App Directory propio.
- **Distribución** — la base instalada se adquiere más barato vía canal/comprador estratégico que vía marketing orgánico desde cero.

### Ignorar deliberadamente

- **Competir en contenido jurídico** contra Aranzadi/Lefebvre: pelea perdida de antemano.
- **Mercado de litigio de volumen US** (terreno de Filevine): fuera de la tesis ES + RD.
- **Construir notoriedad de marca pre-adquisición**: el comprador aporta la marca; gastar aquí destruye valor.

## 5. Argumento de venta

Para un **comprador estratégico** que quiera (a) **entrar en República Dominicana** o (b) **cubrir Verifactu/TicketBAI en España**, Lawzora es un **atajo de 12–18 meses**: un producto multi-jurisdicción ya en producción (Fly.io/Frankfurt, Neon, R2, Brevo), con compliance fiscal de e-invoicing construido, módulo transaccional de gama alta, IA integrada, suscripción cobrando vía Stripe en modo LIVE y pentestado (caja negra + white-box, jun-2026).

La arquitectura es la prueba: monorepo pnpm/Node 20, API NestJS con 185 endpoints REST y RLS multi-tenant, web Next.js 15.5, y un **programa de mejora continua ya operando** (golden-file fiscal determinista + triage con Claude + improvement-scout semanal + Semgrep + CodeQL). El gap real es comercial —pre-revenue—, no técnico: precisamente el perfil que un incumbente con distribución y contenido convierte en ventaja inmediata.
