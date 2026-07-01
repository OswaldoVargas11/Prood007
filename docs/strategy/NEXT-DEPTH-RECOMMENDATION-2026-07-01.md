# Próxima tanda de profundidad — recomendación priorizada (foso)

> Documento de investigación — **Vera (Análisis Transaccional)**. Fecha: 2026-07-01. Issue LAW-74.
> Continúa la línea de `TRANSACTIONAL-DEPTH-GAP-ANALYSIS.md` (T-1/T-2/T-3, ya construidos) con la **siguiente**
> tanda que más ensancha el foso con **esfuerzo contenido y SIN dependencias externas del owner**.
> Mismo criterio: **valor × codeabilidad**. Todo verificado contra rutas/modelos reales, no de memoria.
> Para priorización de Aurora (orquestación) e ingeniería (Tomás); F-1 requiere revisión fiscal (Vera/Diego).

---

## 0. TL;DR

La tanda T-1/T-2/T-3 cerró la **mecánica del día del cierre** (dinero + estado + plazos). La frontera de
profundidad se ha desplazado a los **dos extremos del ciclo del deal** —lo que pasa **antes de firmar** y
**después de cerrar**— y a la **vista de cartera** que agrega lo ya construido. Ninguno existe hoy en código
(verificado). Los tres son **codeabilidad A** (dominio + UI, sin proveedor/cert/deploy) y profundizan el foso
justo donde el practice-management generalista no puede seguir sin reescribir su modelo de datos.

**Recomendación (tanda D, transaccional):**

1. **D-1 · Seguimiento post-closing: covenants / undertakings + calendario de liberación de escrow** (P1)
2. **D-2 · Coordinación de firma/ejecución (signing tracker): páginas de firma por parte y contraparte** (P1)
3. **D-3 · Portfolio de operaciones: cockpit cross-matter (readiness, exposición de escrow, longstops)** (P2)

**Opción fiscal (alto valor, RIESGO fiscal → gate + revisión):**

- **F-1 · Generación del registro de facturación encadenado Verifactu (`RegistroAlta`/`Anulacion` con
  `Huella` + QR), SIN transmisión ni certificado** (P1 del carril fiscal, pero **bloqueado a revisión
  fiscal/legal** antes de darse por hecho).

Todo se apoya en modelos/infra que **ya existen** (funds-flow/escrow de T-1, reminder infra de T-3, cadena
`FiscalEvent` para F-1). Ninguno toca Stripe, Neon, secretos ni deploy.

---

## 1. Por qué esta frontera (y no otra)

La tanda anterior construyó el *instante* del closing. Un deal real, sin embargo, es un **ciclo de vida**:

```
  INTAKE → NEGOCIACIÓN → [ SIGNING ] → GAP (CP satisfaction) → [ CLOSING ] → POST-CLOSING (meses/años)
                              ▲                                     ▲              ▲
                        D-2 ejecución                        T-1/T-2/T-3      D-1 covenants + escrow release
                        (firma/contrapartes)                  (construido)    (NO existe)
```

- **Antes de firmar (D-2):** el `ClosingChecklistItem` ya tiene la categoría `SIGNATURE_PAGE`, pero **no hay
  seguimiento de ejecución** (qué parte ha firmado qué página, contrapartes, cuándo está completa la ronda de
  firmas para disparar el closing). Verificado: `SIGNATURE_PAGE` solo aparece como enum de categoría en
  `closing/`; no existe modelo ni ruta de tracker de firmantes.
- **Después de cerrar (D-1):** el deal **no termina en el closing**. Hay *covenants*/*undertakings* con plazos,
  liberaciones de escrow por *trigger* temporal, earn-outs. Verificado: **no existe** modelo ni ruta post-
  closing (`grep post-closing|covenant|undertaking|earn-out` en `deal/` → 0 resultados). `EscrowHolding` tiene
  `releaseTrigger` como texto, pero **sin calendario ni disparo**.
- **A través de deals (D-3):** el despacho gestiona varias operaciones a la vez; **no hay vista de cartera**
  (verificado: `grep portfolio|pipeline|cross-matter` en `deal/` → 0 resultados). Toda la data para una vista
  ejecutiva (readiness por deal, escrow retenido total, longstops próximos) **ya está** en los modelos de
  T-1/T-2/T-3 — solo falta agregarla.

**Encaje de foso:** ningún practice-management generalista (Clio/Filevine) ni incumbente de contenido
(Aranzadi/Lefebvre) modela el ciclo post-closing ni la coordinación de firma de una operación. Cada uno de
estos sube el coste de réplica del competidor porque exige su propio modelo de datos transaccional.

---

## 2. Inventario de gaps de la próxima frontera (valor × codeabilidad)

Codeabilidad: `A` = dominio + UI, sin deps externas · `B` = requiere IA/integración · `C` = requiere
proveedor/cert/registro externo.

| # | Gap | Valor | Codeab. | Deps owner | Prioridad |
|---|---|---|---|---|---|
| **D-1** | **Post-closing: covenants/undertakings + calendario de liberación de escrow** | Alto | **A** | No | **P1** |
| **D-2** | **Signing tracker: páginas de firma por parte/contraparte → gatillo de closing** | Alto | **A** | No | **P1** |
| **D-3** | **Portfolio de operaciones (cockpit cross-matter)** | Medio-alto | **A** | No | **P2** |
| D-4 | Dependencias entre items del checklist (A bloquea B) — T-4 previo | Medio | A | No | P2 |
| D-5 | Certificado/sign-off de closing counsel (firma del binder, record + hash) | Medio | A | No | P3 |
| **F-1** | **Registro Verifactu encadenado (`Huella`+QR), sin transmisión ni cert** | Alto | **A** | No\* | **P1 (carril fiscal, gated)** |
| F-2 | Agente de IA dentro de add-ins Word/Outlook | Medio-alto | B | No | P2 (carril IA) |
| D-6 | Generación de SPA/documentos del deal con IA + plantillas — T-7 previo | Alto | B | No | Carril Zora |
| D-7 | Redline colaborativo — T-8 previo | Alto | B/C | Sí (evaluar comprar) | Backlog |
| D-8 | Transmisión fiscal real (e-CF CerteCF / remisión Verifactu SOAP) | Muy alto | C | **Sí (cert real)** | Diferido a owner |

\* F-1 no depende de secretos ni proveedor para el **registro + hash + QR** (pura computación); la **firma**
(cert) y la **remisión** (SOAP AEAT) siguen diferidas al owner. F-1 **sí requiere revisión fiscal/legal**
(Vera/Diego) por tocar corrección fiscal — ver §4.

**Criterio de corte para esta tanda:** items `A`, valor Alto/Medio-alto, sin deps del owner → **D-1, D-2, D-3**
(carril transaccional) + **F-1** como opción del carril fiscal (gated a revisión). Se excluyen `B` (Zora: D-6,
F-2) y `C`/deps-owner (D-7, D-8).

---

## 3. Especificaciones de la tanda recomendada (transaccional)

### D-1 · Seguimiento post-closing: covenants/undertakings + liberación de escrow (P1)

**Problema.** El deal desaparece del sistema justo cuando empieza la fase de mayor riesgo latente: los meses/
años **posteriores al closing**. Covenants (no competencia, permanencia de directivos), undertakings
(entregar cuentas auditadas en X meses), *earn-outs* (pago diferido condicionado a métricas) y **liberaciones
de escrow por vencimiento de plazo** son obligaciones con fecha cuyo incumplimiento tiene consecuencia
contractual. Hoy `EscrowHolding.releaseTrigger` es texto libre **sin fecha ni disparo**, y no hay ningún
modelo de covenant. Es el hueco de mayor valor porque **nadie** (ni PM generalista ni contenido) lo cubre.

**Alcance (modelos nuevos acotados + reutilización de la reminder infra de T-3):**
- Nuevo modelo `PostClosingObligation` (tenantId, matterId, kind[`COVENANT`|`UNDERTAKING`|`EARN_OUT`|
  `ESCROW_RELEASE`|`OTHER`], title, description, dueDate, responsiblePartyId?, status[`PENDING`|`SATISFIED`|
  `WAIVED`|`BREACHED`], satisfiedAt, sortOrder).
- **Cablear la liberación de escrow al tiempo:** una `PostClosingObligation` de `kind=ESCROW_RELEASE` puede
  referenciar un `EscrowHolding` y una fecha de trigger; al vencer, alerta (no ejecuta el release — sigue
  siendo acto humano, como el resto del escrow).
- Endpoints CRUD bajo `deal/:matterId/post-closing` con los mismos guards (`@Roles(FIRM_ADMIN, LAWYER)` +
  `@RequiresFeature('closing')`).
- **Reutilizar `milestone-reminders.logic.ts`**: extender el selector de plazos para incluir
  `PostClosingObligation.dueDate` con ventanas prioritarias (earn-out/escrow release = prioritario). No es un
  canal nuevo: es el mismo recordatorio in-app a staff interno de T-3.
- UI: card "Post-Closing" en `deal-cockpit-tab.tsx` con obligaciones por estado, resaltado de vencidas/próximas.

**Criterios de aceptación:**
- [ ] Migración Prisma validada con `prisma migrate diff --from-empty` (gotcha del repo, sin BD local).
- [ ] RLS por tenant (patrón del módulo deal).
- [ ] Test del selector de plazos post-closing (límites de ventana; earn-out/escrow prioritario).
- [ ] La liberación de escrow por trigger **alerta, no ejecuta** (sin mover dinero ni tocar Stripe).
- [ ] Cobertura de servicio en línea con CI (≥90%).

### D-2 · Signing tracker: páginas de firma por parte/contraparte (P1)

**Problema.** El closing checklist marca *qué* documentos se firman (`category=SIGNATURE_PAGE`) pero no *quién*
ha firmado *qué* ni en *cuántos ejemplares* (contrapartes). En un closing real la coordinación de firmas
—recoger páginas de firma de todas las partes antes de datar los documentos ("closing by exchange")— es un
proceso operativo delicado. Hoy no hay estado de ejecución por firmante. Verificado: `SIGNATURE_PAGE` solo
existe como enum de categoría; sin tracker.

**Alcance (modelo acotado, reutiliza `DealParty` y `ClosingChecklistItem`):**
- Nuevo modelo `SignatureBlock` (tenantId, matterId, documentLabel, partyId → `DealParty`, role, required
  bool, status[`PENDING`|`RECEIVED`|`RELEASED`], receivedAt, notes) — una fila por (documento × parte).
- Cómputo de "ronda de firmas completa": todas las `required` en `RECEIVED`/`RELEASED` → señal
  **"listo para datar/cerrar"** (complementa el readiness de CP de T-2; juntos dan el go/no-go del closing).
- Endpoints `deal/:matterId/signatures` (CRUD + acción `release` de páginas retenidas en escrow de firma).
- UI: sección "Signing" que cruza documentos × partes con estado, y un banner "N/M páginas recibidas".
- **Explícitamente NO es firma electrónica** (Signaturit ya existe y es otro flujo): es **seguimiento de
  estado** de la coordinación de firma manual/wet-ink/exchange típica de un closing transaccional.

**Criterios de aceptación:**
- [ ] Migración validada sin BD local; RLS por tenant.
- [ ] Cálculo de "ronda completa" server-side y testeado (0 firmas, parcial, todas required recibidas).
- [ ] No solapa con el módulo `signatures/` (Signaturit): distinto propósito, distinto modelo; documentar el límite.

### D-3 · Portfolio de operaciones: cockpit cross-matter (P2)

**Problema.** Todo lo construido (T-1/T-2/T-3, D-1/D-2) es **por deal**. Un socio que gestiona 8 operaciones
no tiene una vista ejecutiva: qué deal está más cerca del closing, cuánto escrow retiene el despacho en total,
qué longstops vencen este mes, qué obligaciones post-closing están vencidas. **No existe** (verificado). Es
pura **agregación** sobre modelos existentes — la mejor relación valor/coste de la tanda.

**Alcance (solo lectura/agregación, sin schema nuevo):**
- Endpoint `GET /deal/portfolio` que agrega, por matter transaccional del tenant: readiness al signing/closing
  (de `computeReadiness`), escrow retenido y liberado (de `EscrowHolding`/`EscrowRelease`), próximos hitos
  prioritarios (longstop/CP deadline de T-3), obligaciones post-closing vencidas/próximas (D-1).
- UI: nueva vista "Operaciones" (tabla/kanban) con KPIs de cartera: nº deals por fase, exposición de escrow
  total por moneda, longstops del mes, adherencia a plazos.
- Reutiliza guards y RLS existentes; sin nuevos modelos ni migración.

**Criterios de aceptación:**
- [ ] La agregación es server-side, acotada por `tenantId`/RLS, y testeada (cartera vacía, mezcla de fases).
- [ ] Sin N+1: una consulta agregada, no un fan-out por deal.
- [ ] Se apoya en `computeReadiness` y en los agregados de escrow **ya existentes** (no reimplementar).

---

## 4. Opción del carril fiscal — F-1 (gated a revisión fiscal/legal)

### F-1 · Registro de facturación Verifactu encadenado (`Huella` + QR), sin transmisión ni certificado

**Hallazgo (verificado).** `verifactu-signer.service.ts` **firma** un `registroXml` que recibe **ya
construido**, pero **nada en el repo genera ese registro**: `grep signRecord|RegistroAlta|buildRegistro` →
solo el firmante, su test y el módulo; **cero constructores** y **cero llamadas desde el flujo de facturación**.
Es decir, la claim de la web "**registro encadenado conforme**" (Verifactu) descansa hoy sobre un primitivo de
firma **sin el registro encadenado que firmar**. El **registro + `Huella` (hash encadenado) + QR** es **pura
computación** (RD 1007/2023 + Orden HAC/1177/2024): NO requiere certificado (eso es solo la firma) ni remisión
(eso es solo el envío SOAP a la AEAT). Construirlo:

1. **Hace precisa y demostrable** la claim fiscal de la web (hoy es una claim sin sustrato generable).
2. **Profundiza el foso fiscal ES** —el núcleo diferenciador— sin depender del owner.
3. Deja el seam listo: cuando llegue el cert, solo se firma; cuando llegue el banco de pruebas, solo se remite.

**Alcance (dominio puro, apalancando la cadena `FiscalEvent` existente):**
- Constructor `buildRegistroAlta(invoice)` / `buildRegistroAnulacion` que emite el XML del registro con los
  campos RRSIF (emisor, `IDFactura`, tipo, importe, desglose) y el **encadenamiento**: `Huella` =
  SHA-256 sobre los campos canónicos + `Huella` del registro anterior del tenant (la cadena
  `FiscalEvent`/`InvoiceSequence` ya provee el "anterior" y el `pg_advisory_xact_lock` para atomicidad).
- Generación del **código QR** Verifactu (URL de cotejo AEAT + parámetros del registro) como dato del registro.
- Persistencia inmutable del registro en la cadena append-only existente (reutilizar el patrón `FiscalEvent`,
  rol de app sin UPDATE/DELETE).
- Wire opcional (gated por flag) en la emisión de factura ES para generar el registro al emitir.

**Por qué va GATED y no directo (política del tablero, CLAUDE.local.md §fiscal):**
- Toca **corrección fiscal** (dominio de máximo riesgo, hoy sin dueño). Regla del proyecto: todo cambio
  fiscal/legal **pasa por revisión antes de darse por hecho** — **Vera** audita, **Diego** revisa el diff.
- Checklist mínimo obligatorio antes de cerrar: (a) exactitud del algoritmo de `Huella` y del contenido del QR
  contra la especificación (Orden HAC/1177/2024); (b) inmutabilidad de la cadena intacta; (c) claves i18n
  fiscales usadas existen en `es.json` (anti-MISSING_MESSAGE); (d) la claim de web queda **exactamente** al
  nivel de lo construido ("registro encadenado conforme generado" ≠ "transmitido a la AEAT").

**Recomendación de secuencia para F-1:** por su riesgo y su valor, F-1 merece **su propia investigación fiscal
previa** (Vera) que fije el spec exacto del `Huella`/QR contra la norma, **antes** de que ingeniería lo tome.
Es el clásico "razona a fondo antes de codear" del dominio fiscal. Propuesta: abrir un issue hijo de análisis
fiscal F-1 y, con el spec validado, un issue de implementación gated por flag.

---

## 5. Lo que NO recomiendo construir ahora (y por qué)

- **D-8 Transmisión fiscal real (e-CF CerteCF / remisión Verifactu SOAP):** el mayor multiplicador de valor,
  pero **requiere el certificado real del owner** y banco de pruebas. Fuera del carril seguro. Diferido a owner.
- **D-7 Redline colaborativo:** alto coste, solapa con add-ins Word ya entregados; evaluar **comprar/integrar**
  (Litera/Draftable) antes que construir. Backlog.
- **D-6 Generación de SPA con IA / F-2 agente en Word-Outlook:** valiosos pero son **carril Zora (IA, `B`)**,
  no profundidad transaccional/fiscal pura. Encajan como tools del agente / trabajo de ecosistema; anotar como
  cross-link, no mezclar en esta tanda `A`.
- **App móvil nativa / marketplace / contenido jurídico:** gaps estructurales o comerciales; estrategia
  aprobada = partnerizar/aceptar, no construir (`COMPETITIVE-GAP-ANALYSIS.md §4`).

---

## 6. Encaje estratégico y de venta

- **Due-diligence de producto:** D-1/D-2 convierten "tenemos la mecánica del cierre" en "modelamos el **ciclo
  de vida completo** del deal, del signing al post-closing" — que es lo que distingue a un producto
  transaccional serio de un checklist. D-3 lo hace **visible** en una sola pantalla ejecutiva.
- **Demo de venta:** un **calendario post-closing que avisa del earn-out** y un **signing tracker que dice
  "faltan 2 páginas de firma"** son artefactos que un despacho de M&A reconoce como "esto lo entiende quien ha
  cerrado operaciones". El **portfolio** es el *money shot* para el socio director.
- **Foso:** cada item sube el coste de réplica del generalista (exige modelo de datos transaccional propio) y
  del incumbente de contenido (no es su terreno). F-1, además, **blinda la claim fiscal ES** que es núcleo del
  diferenciador — con la disciplina de revisión que el dominio exige.

---

## 7. Próximos pasos propuestos (para Aurora)

1. **Tanda transaccional D (carril seguro, sin owner):** priorizar **D-1 → D-2 → D-3** (D-1 primero: mayor
   valor y reutiliza la reminder infra de T-3; D-3 al final porque agrega D-1/D-2). Ingeniería (Tomás) en
   worktree aislado sobre `agents/sandbox`, gated por `@RequiresFeature('closing')`, sin push/deploy.
2. **Carril fiscal F-1 (gated):** abrir issue hijo de **análisis fiscal** (Vera) que fije el spec de
   `Huella`/QR contra Orden HAC/1177/2024; solo con spec validado + revisión de Diego, un issue de
   implementación con feature-flag. **No** codear F-1 sin ese análisis previo.
3. **QA (Carla):** extender el plan de regresión con post-closing (plazos), signing tracker (ronda completa) y
   portfolio (agregación).
4. **Vera (este rol):** disponible para (a) el análisis fiscal F-1, (b) profundizar specs de D-1/D-2 por item,
   o (c) análisis de paridad transaccional vs. herramientas dedicadas (Datasite/Intralinks/Litera) si se pide.

> Documento vivo. Rutas y modelos citados verificados contra `agents/sandbox` a 2026-07-01. Criterio
> valor×codeabilidad idéntico al de `TRANSACTIONAL-DEPTH-GAP-ANALYSIS.md`.
