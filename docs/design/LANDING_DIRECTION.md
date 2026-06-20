# Landing pública — dirección propuesta (Parte B)

**Estado:** PROPUESTA (estructura + borrador de copy + concepto visual). **No construida ni publicada.**
Misma marca, **Geist** y tokens que la app + el sistema de movimiento de `DESIGN_AUDIT.md`.
El **copy de valor y de precios lo revisas tú** antes de construir.

---

## 0. Cambio de routing necesario (presentación + routing — lo señalo aparte)

Hoy `/` → login. Propuesta:

- `/` → **landing pública** (sin auth).
- `/login` → la app de login actual (sin cambios de lógica).
- App detrás de auth como hoy.

> Esto toca `middleware.ts` (dejar `/` público) y el `<Link>`/redirect de "entrar". Es **presentación +
> enrutado**, sin lógica de negocio. Lo confirmo contigo antes de tocarlo (afecta a tests de middleware).

---

## 1. Estructura (secciones, de arriba a abajo)

1. **Nav** minimal: logo Lawzora · enlaces ancla (Producto · Cumplimiento · Precios) · **Iniciar sesión** ·
   CTA **Prueba gratis**.
2. **Hero:** titular + subtítulo (línea matadora de cumplimiento) + CTA primario (prueba 15 días) +
   secundario (solicitar demo) + visual de producto (captura de la app ya pulida en marco de dispositivo).
3. **Diferenciador (el foso):** Verifactu (ES) + e-CF (RD) nativo y obligatorio — claridad, no jerga.
4. **Beneficios clave:** cobro online, provisión de fondos, plazos procesales, portal del cliente,
   **todo incluido** (sin tiers de funciones). Tarjetas con icono + 1 frase + captura/preview.
5. **Confianza:** seguridad (cifrado en reposo, MFA), RGPD/Ley 172-13, multi-despacho aislado (RLS).
6. **Capturas / producto:** 2-3 superficies clave (expediente, factura con sello fiscal, portal).
7. **Planes:** modelo **todo-incluido por usuario** — copy de precios **marcado `[REVISAR PRECIOS]`**.
8. **CTA final** + **footer** (legal: privacidad/términos · contacto · dominio lawzora.com · ES/RD).

---

## 2. Borrador de copy (es-ES) — para tu revisión

> Marcado `[REVISAR]` lo que es mensaje de valor/precio que decides tú.

**Hero**

- Kicker: `Software de gestión para despachos · España y República Dominicana`
- Titular (H1): **`El despacho, al día. La facturación, en regla.`**
  _(alt: `Gestiona tu despacho y cumple con Hacienda, sin hojas de cálculo.`)_
- Subtítulo (la línea matadora): **`Único con Verifactu (España) y e-CF (Rep. Dominicana) nativos:
facturación fiscal válida desde el primer día, sin add-ons ni integraciones a medias.`** `[REVISAR]`
- CTA primario: **`Empieza gratis 15 días`** · CTA secundario: `Solicitar una demo`
- Pie de hero: `Sin tarjeta para empezar · Todo incluido · ES/RD`

**Diferenciador (el foso)**

- Título: **`Cumplimiento fiscal de verdad, no una casilla`**
- Cuerpo: `Verifactu y e-CF no son un extra: son la ley. Lawzora emite facturas con su registro fiscal
encadenado y su QR/eNCF de cotejo, listas para AEAT y DGII. Lo que otros dejan para "más adelante",
aquí ya funciona.` `[REVISAR]`

**Beneficios (4-6 tarjetas)**

- **Cobro online** — `Cobra a tus clientes con tarjeta; el dinero va directo a tu cuenta.`
- **Provisión de fondos** — `Pide provisiones y lleva el saldo del expediente en tiempo real.`
- **Plazos procesales** — `Calcula vencimientos con días hábiles y festivos; recordatorios que no fallan.`
- **Portal del cliente** — `Tu cliente ve sus expedientes, facturas y documentos en un espacio propio.`
- **Todo incluido** — `Sin niveles de funciones: todas las capacidades, una tarifa por usuario.` `[REVISAR]`
- **ES + RD** — `Una sola herramienta para despachos en España, en RD o en ambos.`

**Confianza**

- Título: **`Tus datos, blindados`**
- Puntos: `Cifrado en reposo` · `Verificación en dos pasos (2FA)` · `RGPD / Ley 172-13` ·
  `Aislamiento total entre despachos`.

**Planes** `[REVISAR PRECIOS]`

- Título: `Una tarifa, todo dentro` · Subtítulo: `Por usuario activo. Sin sorpresas.`
- (Placeholder de precio + bullets de "incluye todo" + CTA. **Pendiente de tus cifras.**)

**CTA final**

- Título: **`Pon tu despacho en regla hoy`** · CTA: `Empieza gratis` / `Habla con nosotros`.

---

## 3. Concepto visual

- **Marca y tipografía idénticas a la app** (Geist + tokens oklch). Dark-first en el hero (sereno,
  premium), claro en el cuerpo; respeta el toggle de tema.
- **Acento de marca con moderación** + grises; **gradiente/grano MUY sutiles** solo de fondo del hero
  (con gusto, on-brand serio — nada de degradado morado chillón).
- **Capturas reales** de la app (de la Parte A, ya pulida) en marcos de dispositivo; cero mockups falsos.
- **Sellos de cumplimiento** (Verifactu/e-CF) como insignias de confianza visibles.
- **Movimiento:** entrada del hero (fade+lift), **revelados al hacer scroll** (`whileInView`, una vez),
  hover sutil en tarjetas/CTAs. Todo con los tokens de movimiento y **`prefers-reduced-motion`**.
- **Responsive** y **AA/WCAG 2.2** desde el inicio.

---

## 4. Nota sobre el formulario de "Solicitar demo"

El CTA secundario (demo) idealmente captura un email → eso necesitaría **backend** (endpoint + envío).
Como pediste, lo señalo **aparte**: para la primera versión puedo dejar el CTA apuntando a
`mailto:`/WhatsApp (sin backend), y si quieres un formulario real lo proponemos como pieza separada.

→ **Esperando tu OK sobre estructura + copy (valor/precios) + concepto antes de construir la landing.**
