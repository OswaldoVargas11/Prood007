# Auditoría de diseño + dirección visual + sistema de movimiento — Lawzora

**Fecha:** 2026-06-20 · **Alcance:** SOLO capa de presentación (cero lógica, endpoints o datos).
**Objetivo:** que la app "se sienta como Linear / Stripe" sobre el sistema **ya existente** (Geist +
shadcn/Radix + tokens oklch + framer-motion), con una **capa didáctica** que explique el foso fiscal.

> ⏸️ **Documento de PROPUESTA. No se ha reestilizado nada ni se ha publicado la landing.** A la espera
> de tu OK sobre la dirección antes de implementar por superficies (PRs pequeños con antes/después).

> Nota: el skill `/mnt/skills/public/frontend-design/SKILL.md` no existe en este entorno (ruta del
> sandbox Linux). La auditoría usa los principios del brief (Refactoring UI, Linear/Stripe, heurísticas
> de Nielsen, WCAG 2.2) + el sistema de diseño real del repo.

---

## 0. Lo que YA está bien (no se toca, se construye encima)

- **Tokens maduros** en `globals.css`: color **oklch**, superficies por capas (`--surface-1/2/3`,
  `--elevated`), paleta semántica completa (`success/warning/info/violet/danger` + `*-soft`), escala de
  **elevación sutil** (`--shadow-xs…xl`), `--radius 0.8rem`, gradiente de **marca/IA** reservado.
- **Tipografía Geist** (sans + mono) autohospedada; **`tabular-nums`** para dinero/fechas.
- **Dark/light** completo y coherente.
- **Base de movimiento** en `lib/motion.ts` (`EASE_STANDARD`, `DURATION`, `screenEnter`, `pressScale`) y
  **`prefers-reduced-motion`** respetado en `PageTransition`. El botón shadcn ya tiene `active:scale-[0.97]`.
- **Onboarding incipiente:** `FirstStepsCard` (checklist) y página `/onboarding`.

**Conclusión:** el sistema es sólido pero **infrautilizado** — el movimiento solo vive en la transición
de página, no hay primitivas para estados vacíos ni ayuda contextual, y la jerarquía depende demasiado
del tamaño. El trabajo es **destilar y aplicar con consistencia**, no rediseñar.

---

## 1. Hallazgos transversales (sistema), priorizados por impacto en demo

| ID  | Prioridad | Heurística                      | Hallazgo                                                                                                                                                                       | Propuesta (presentación)                                                                                                                                      |
| --- | --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **P0**    | H10 Ayuda · H2 Lenguaje         | No hay primitiva de **ayuda contextual**. Verifactu, e-CF, provisión, rectificativa, plazo procesal, retención IRPF aparecen **sin explicar**. Es el foso y no se cuenta.      | Nuevo `InfoHint`/`<Explain>` (Popover Radix con título + 1-2 frases + opcional "saber más"). Glosario fiscal i18n. Usado con moderación junto a cada término. |
| S2  | **P0**    | H8 Estética · H1 Estado         | **Estados vacíos ad-hoc** (texto gris suelto), no enseñan.                                                                                                                     | Nuevo `EmptyState` (icono + qué es + CTA primario). Datos reales en demos, nunca lorem.                                                                       |
| S3  | **P1**    | H9 Errores                      | Errores de una línea (`messageKey`): no dicen **qué pasó + por qué + qué hacer**.                                                                                              | `FormError`/`Callout` con estructura: causa + acción. Microcopy revisado por superficie.                                                                      |
| S4  | **P1**    | (movimiento)                    | Tokens de motion solo en `PageTransition`. Sin **stagger** de listas, sin **skeleton→contenido**, sin **expand/collapse** animado (timeline, tabs), sin `MotionConfig` global. | Sistema de movimiento de la §3 (extiende `lib/motion.ts`).                                                                                                    |
| S5  | **P1**    | H8 Minimalismo · Refactoring UI | Jerarquía apoyada en **tamaño**; densidad desigual.                                                                                                                            | Escala tipográfica codificada (peso + color, no solo tamaño); **un foco por vista** (Von Restorff).                                                           |
| S6  | **P2**    | Polaris/Carbon                  | Tablas densas (ledger, facturas, informes) correctas pero sin pulido de densidad.                                                                                              | Hover de fila, numéricos alineados a la derecha (+`tabular-nums`), cabecera fija, zebra opcional.                                                             |
| S7  | **P2**    | H7 Flexibilidad                 | ⌘K y quick-add existen pero **poco descubribles**.                                                                                                                             | Hint de teclado visible; primer-uso señala el ⌘K.                                                                                                             |
| S8  | **P2**    | WCAG 2.2 AA                     | Verificar contraste de `text-subtle`/`muted` sobre superficies, foco visible en todos los targets, tamaño de target (24px+).                                                   | Pasada AA por superficie (no rebrand).                                                                                                                        |

---

## 2. Auditoría por superficie (orden de demo)

### 2.1 Login / registro — **P1**

Estado: `Card max-w-sm`, fondo con gradiente sutil de marca, logo, título/subtítulo, login social + paso
**MFA**, pie con privacidad/términos. **Buena base.**

- **H1/H9:** el paso MFA y los errores sociales se muestran, pero el error genérico es escueto → microcopy.
- **H2/H6:** "despacho" vs "tenant"; el login multi-despacho debe explicar _por qué_ se elige despacho.
- **H10 didáctico:** el **registro** debería abrir el **tour saltable + checklist** (despacho→cliente→
  expediente→factura). Hoy `/onboarding` existe; conviene hilarlo y hacerlo **skippable** con progreso.
- **Movimiento:** entrada del card (fade+lift), social/MFA con transición suave entre pasos.

### 2.2 Dashboard — **P1**

Estado: saludo según hora, `FirstStepsCard`, `KpiRow`, `RevenueCard`+`DigestCard`, `DeadlinesCard`+
`ActivityCard`, `DashboardSkeleton`. **Estructura correcta y con skeleton.**

- **H8/Von Restorff:** 4 KPIs con igual peso → elegir **una** métrica protagonista (p. ej. facturado/mes)
  y bajar el resto a soporte.
- **H1 estado vacío:** despacho nuevo → el `FirstStepsCard` ya ayuda; reforzar con copy "qué verás aquí".
- **Movimiento:** **stagger** de tarjetas al entrar; **skeleton→contenido** con crossfade; barras del
  RevenueCard animando altura (`scaleY`/pathLength) una sola vez.

### 2.3 Expediente / timeline — **P0** (corazón de la demo)

Estado: detalle con **9 pestañas** (resumen, documentos, tareas, costes, provisión, facturación, chat,
correos, actividad), tarjeta de **partes/procedimiento**, **timeline** unificado (recién añadido).

- **H7/Hick:** **9 pestañas** son muchas para escanear → considerar **agrupar** (p. ej. "Económico" =
  costes+provisión+facturación) o priorizar visualmente las 3-4 de demo. _(Solo reordenar/agrupar UI.)_
- **H8 calm design:** resumen arriba, **detalle bajo demanda**; ocultar metadatos hasta que hacen falta.
- **H10:** ayuda contextual en **fase procesal / nº autos / plazo** y en **provisión de fondos**.
- **Movimiento:** **expand/collapse animado** del timeline y de la sección "Datos del procedimiento";
  **stagger** del feed; cambio de pestaña con crossfade corto (sin desplazamientos bruscos).

### 2.4 Factura (Verifactu / e-CF + QR) — **P0** (el foso, vende solo)

Estado: detalle de factura + PDF con membrete; bloque de cumplimiento fiscal con QR de cotejo (ES) / eNCF
(RD).

- **H1/H8:** el cumplimiento **es el diferenciador** → **celebrarlo visualmente** (sello "Verifactu ·
  AEAT" / "e-CF · DGII" con check, no como texto menor).
- **H10:** `InfoHint` en **"Verifactu", "cotejo AEAT", "huella encadenada", "eNCF"** — explicar _qué es y
  por qué importa_ convierte la demo. Es exactamente lo que pediste destacar.
- **H2:** términos exactos (base imponible, retención IRPF/IRPF, ITBIS) con su glosario.
- **Movimiento:** aparición del sello/QR con un realce sutil; nada rebotón (es un documento legal).

### 2.5 Portal del cliente — **P0** (la cara del despacho ante su cliente)

Estado: mis expedientes, documentos (ver + **subir**), facturas + **pago**, ledger (solo aprobados),
provisión, tareas, chat.

- **Von Restorff:** el **CTA de pago** debe ser el foco cuando hay factura pendiente.
- **H2/H10:** el cliente NO es jurista → lenguaje llano + ayuda ("provisión de fondos", "qué es esta
  factura"). **Estados vacíos que tranquilizan** ("aún no hay documentos; tu despacho los subirá aquí").
- **H8:** premium y sereno — es la primera impresión del despacho; menos densidad que la vista interna.
- **Movimiento:** entrada serena, subida de documento con feedback claro (progreso→hecho).

---

## 3. Dirección visual propuesta (extiende el sistema; cero estilos sueltos)

**Principio:** _seriedad legal + precisión, moderno y sereno (Linear), con divulgación progresiva
(Stripe)._ Nada de SaaS genérico.

1. **Un acento, muchos grises.** La marca (`--brand`, índigo ~264) es el ÚNICO acento de acción. El
   **gradiente IA (`--ai-from→--ai-to`, 264→300) se reserva EXCLUSIVAMENTE a superficies de IA** — no se
   usa como decoración general (esto evita el "degradado morado genérico" que mencionas).
2. **Jerarquía por peso + color, no por tamaño** (Refactoring UI). Escala de uso a codificar:
   - Título de página: ~24px / 600 · Sección: ~15px / 600 · Cuerpo: ~13.5px · Meta: ~12px / `muted`.
   - Etiquetas/уppercase tracking para encabezados de tabla y "kicker".
3. **Profundidad con sombras sutiles, no bordes duros.** Tarjetas = `surface-1` + `--shadow-xs/sm` +
   borde tenue; reservar bordes fuertes para separar densidad real.
4. **Un foco por vista** (Von Restorff): el CTA primario en `brand` sólido; el resto `outline`/`ghost`.
   Menos opciones por pantalla (Hick), targets generosos (Fitts), patrones conocidos (Jakob).
5. **Datos densos** (Polaris/Carbon): numéricos a la derecha con `tabular-nums`, hover de fila, cabeceras
   fijas, alineación consistente; cero ruido.
6. **Capa didáctica como ciudadana de primera:** `EmptyState`, `InfoHint`, `Callout` de error — primitivas
   compartidas, no parches por página.
7. **Identidad fiscal visible:** sellos de cumplimiento (Verifactu/e-CF) tratados como **insignias de
   confianza**, no como letra pequeña.

**Primitivas nuevas a crear (presentación pura, sobre Radix/shadcn):**
`EmptyState`, `InfoHint` (Popover de ayuda), `Callout` (info/success/warning/danger usando los `*-soft`),
`Kbd` (hint de atajo), `SectionHeader` (kicker+título+acción), `StatTile` (KPI con jerarquía), y los
**componentes de movimiento** de la §4.

---

## 4. Sistema de movimiento propuesto (extiende `lib/motion.ts`)

**Filosofía:** movimiento **con propósito**, suave y contenido (Linear); nunca rebotón ni decorativo.
GPU‑only (`transform`/`opacity`), `height` solo con `layout`/medición; **`prefers-reduced-motion` global**.

### 4.1 Tokens (única fuente de verdad, en `lib/motion.ts` + espejados como CSS vars en `globals.css`)

- **Easings:** `standard [0.22,0.8,0.2,1]` (ya existe) · `entrance` (decel) · `exit` (accel) · `spring`
  suave (drawer/sheet).
- **Duraciones:** `micro 150ms` (hover/press/switch) · `base 220ms` (entradas, tabs, badges) ·
  `overlay 320ms` (⌘K/Dialog/Sheet) · `expand 260ms` (accordion/timeline) · `chart 480ms`.
- Espejo en CSS: `--ease-standard`, `--dur-micro/base/overlay/expand` para que las transiciones **CSS**
  (botón, switch, hover) usen los MISMOS valores (hoy el botón hardcodea 150ms ≈ token, lo unificamos).

### 4.2 Variants compartidas (framer)

- `fade`, `fadeUp` (entrada de pantalla, ya ~`screenEnter`).
- `listStagger` + `listItem` (entrada escalonada de listas/tarjetas; stagger ~40-60ms, máx ~6-8 ítems).
- `expandCollapse` (height/opacity para timeline, "Datos del procedimiento", acordeones).
- `crossfade` (skeleton→contenido y cambio de pestaña).
- `pressScale` (ya existe) extendido a targets interactivos.

### 4.3 Infra

- **`<MotionConfig reducedMotion="user">`** en el root de la app y de la landing → **toda** animación
  framer respeta `prefers-reduced-motion` sin repetir lógica (hoy solo lo hace `PageTransition`).
- Reglas CSS `@media (prefers-reduced-motion: reduce)` para las transiciones CSS.

### 4.4 Aplicación por superficie (microinteracciones + continuidad)

- **Global:** hover/focus/press de botones, switches, validación inline; transición suave de **tema**.
- **Listas (clientes, expedientes, tareas, facturas):** `listStagger` al cargar; `skeleton→contenido`.
- **Dashboard:** stagger de tarjetas; barras de ingresos animando una vez.
- **Timeline / acordeones:** `expandCollapse`.
- **Pestañas del expediente:** `crossfade` corto al cambiar.
- **Overlays (⌘K, Dialog, Sheet, Drawer):** entrada/salida con `overlay`/spring (con `AnimatePresence`).
- **Landing:** revelados al hacer scroll (`whileInView`, una vez), entrada del hero, acentos sutiles.

---

## 5. Plan de entrega propuesto (tras tu OK)

1. **Fundaciones (1 PR):** tokens de movimiento (CSS + `lib/motion.ts`), `MotionConfig` global, y las
   primitivas `EmptyState`/`InfoHint`/`Callout`/`Kbd`/`SectionHeader`/`StatTile`. Sin tocar pantallas aún.
2. **Por superficie, PRs pequeños con capturas antes/después**, en orden de demo:
   login/registro → dashboard → expediente/timeline → factura (foso) → portal.
3. **Glosario fiscal i18n** (es-ES/es-DO) para `InfoHint`.
4. Cada PR: preserva funcionalidad, dark/light, i18n, AA/WCAG 2.2, responsive, `prefers-reduced-motion`;
   **no rompe e2e** (si cambia marcado, se ajustan selectores).

→ **Esperando tu OK sobre esta dirección (visual + movimiento) antes de implementar.**
