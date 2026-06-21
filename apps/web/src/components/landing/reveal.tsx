'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { DURATION, EASE } from '@/lib/motion';

/**
 * Revelado al hacer scroll (una sola vez), para la landing. Respeta prefers-reduced-motion vía el
 * `<MotionConfig reducedMotion="user">` global. Anima solo `opacity`/`transform` (GPU).
 */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: DURATION.base, ease: EASE.entrance, delay }}
    >
      {children}
    </motion.div>
  );
}
