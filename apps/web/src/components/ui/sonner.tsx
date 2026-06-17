'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

/**
 * Toaster global (sonner) que sigue el tema claro/oscuro de next-themes y usa los tokens CSS del
 * diseño. Se monta una sola vez por superficie (shell del despacho y del portal). Los toasts son
 * efímeros y complementarios a la campana de notificaciones (no la sustituyen).
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as 'light' | 'dark' | undefined) ?? 'dark'}
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--elevated)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
        },
      }}
    />
  );
}
