import type { Transition, Variants } from 'framer-motion';

/**
 * Tokens de MOVIMIENTO del sistema de diseño (única fuente de verdad; espejados como CSS vars en
 * `globals.css` para que las transiciones CSS usen los mismos valores).
 *
 * Filosofía: movimiento con propósito, suave y contenido (estilo Linear). GPU-only (`transform`/
 * `opacity`); `height` solo con `layout`/medición. `prefers-reduced-motion` se respeta de forma global
 * vía `<MotionConfig reducedMotion="user">` en `providers.tsx` (no hace falta repetir la lógica).
 *
 *  - micro 150ms   → hover / focus / press / switch / validación inline
 *  - base 220ms    → entrada de pantalla, tabs, badges, entrada de listas
 *  - expand 260ms  → acordeón / timeline / expand-collapse
 *  - overlay 320ms → ⌘K / Dialog / Sheet / Drawer (con AnimatePresence)
 *  - chart 480ms   → barras / progreso / pathLength
 */

/** Curvas (easing). `standard` es la curva base del sistema; `entrance` decelera, `exit` acelera. */
export const EASE_STANDARD = [0.22, 0.8, 0.2, 1] as const;
export const EASE = {
  standard: EASE_STANDARD,
  entrance: [0.16, 1, 0.3, 1] as const, // deceleración (cosas que entran)
  exit: [0.4, 0, 1, 1] as const, // aceleración (cosas que salen)
} as const;

/** Duraciones en segundos (las que usan los `Variants`/`Transition` de framer). */
export const DURATION = {
  micro: 0.15,
  base: 0.22,
  expand: 0.26,
  overlay: 0.32,
  chart: 0.48,
  // Alias retro-compatibles (uso previo en el código):
  screen: 0.22,
  tabs: 0.22,
  press: 0.14,
} as const;

/** Spring suave para drawer/sheet móviles. */
export const DRAWER_SPRING: Transition = { type: 'spring', damping: 30, stiffness: 300 };

// ── Variants compartidas ──────────────────────────────────────────────────────

/** Aparición simple (opacidad). */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_STANDARD } },
};

/** Aparición con leve elevación (entrada de pantalla/tarjeta). */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_STANDARD } },
};

/** Entrada de pantalla (alias histórico de `fadeUp`, usado por `PageTransition`). */
export const screenEnter: Variants = fadeUp;

/**
 * Contenedor de lista con entrada ESCALONADA (stagger). Úsese con `staggerItem` en los hijos. El
 * stagger se acota (~45ms) y conviene limitarlo a las primeras ~8 filas para no encadenar de más.
 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_STANDARD } },
};

/** Expand/collapse (acordeón, timeline). Usar con `AnimatePresence` y `overflow-hidden`. */
export const expandCollapse: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: { duration: DURATION.expand, ease: EASE_STANDARD },
      opacity: { duration: DURATION.micro },
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: DURATION.expand, ease: EASE.exit },
      opacity: { duration: DURATION.micro },
    },
  },
};

/** Crossfade corto (skeleton→contenido, cambio de pestaña). */
export const crossfade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_STANDARD } },
  exit: { opacity: 0, transition: { duration: DURATION.micro, ease: EASE.exit } },
};

/** Micro-interacción de press (scale .97), para botones/targets que la adopten. */
export const pressScale = {
  whileTap: { scale: 0.97 },
  transition: { duration: DURATION.micro, ease: 'easeOut' },
} as const;
