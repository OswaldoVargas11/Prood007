'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { screenEnter } from '@/lib/motion';

/**
 * Envuelve el `<main>` con la animación de «Entrada de pantalla» del sistema de diseño
 * (220 ms · ease [0.22,0.8,0.2,1] · y 8→0), re-disparada en cada navegación (key por ruta).
 * Respeta `prefers-reduced-motion`: si el usuario lo pide, no anima (accesibilidad AA).
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pathname = usePathname();

  return (
    <motion.main
      key={pathname}
      className={className}
      variants={screenEnter}
      initial={reduce ? false : 'hidden'}
      animate="visible"
    >
      {children}
    </motion.main>
  );
}
