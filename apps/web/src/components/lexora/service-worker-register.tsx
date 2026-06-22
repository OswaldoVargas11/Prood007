'use client';

import { useEffect } from 'react';

/** Registra el service worker (PWA instalable). Inerte si el navegador no lo soporta. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registro best-effort: si falla, la app sigue funcionando igual */
      });
    }
  }, []);
  return null;
}
