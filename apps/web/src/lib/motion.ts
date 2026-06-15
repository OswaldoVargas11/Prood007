import type { Transition, Variants } from 'framer-motion';

/**
 * Tokens de movimiento del sistema de diseño (handoff `design/Lexora-Implementation.dc.html`).
 * Centralizados para que toda animación use las mismas curvas/duraciones que especifica el diseño.
 *
 *  - Entrada de pantalla: 220 ms · ease [0.22, 0.8, 0.2, 1] · y 8→0
 *  - Tabs / badges:       220 ms · ease-out
 *  - ⌘K / Sheet / Dialog: 320 ms · ease-out (+ AnimatePresence)
 *  - Drawer móvil:        spring, damping 30
 *  - Hover / press:       140 ms · ease-out · scale .97 al press
 *  - Charts / progreso:   480 ms · ease-out · pathLength
 */
export const EASE_STANDARD = [0.22, 0.8, 0.2, 1] as const;

export const DURATION = {
  screen: 0.22,
  tabs: 0.22,
  overlay: 0.32,
  press: 0.14,
  chart: 0.48,
} as const;

/** Spring del drawer móvil (damping 30). */
export const DRAWER_SPRING: Transition = { type: 'spring', damping: 30, stiffness: 300 };

/** Entrada de pantalla: opacidad 0→1, y 8→0 con la curva estándar. */
export const screenEnter: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.screen, ease: EASE_STANDARD } },
};

/** Micro-interacción de press (scale .97), para botones/targets que la adopten. */
export const pressScale = {
  whileTap: { scale: 0.97 },
  transition: { duration: DURATION.press, ease: 'easeOut' },
} as const;
