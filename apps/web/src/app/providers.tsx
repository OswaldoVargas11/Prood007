'use client';

import { useState, type ReactNode } from 'react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { MotionConfig } from 'framer-motion';
import { toast } from 'sonner';
import { AuthProvider } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { EASE_STANDARD } from '@/lib/motion';

/**
 * Providers de cliente: estado de servidor (TanStack Query), tema claro/oscuro (next-themes con
 * clase `.dark`) y sesión (AuthProvider). El default es oscuro (estética del diseño).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Feedback global: ninguna acción (crear/guardar/borrar/aprobar) falla en silencio. El mensaje
        // de la API ya viene legible; para errores de red/desconocidos, un aviso genérico. Una mutación
        // puede desactivarlo con `meta: { skipErrorToast: true }` si gestiona su propio error en la UI.
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.meta?.skipErrorToast) return;
            const msg =
              error instanceof ApiError
                ? error.message
                : 'No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.';
            toast.error(msg);
          },
          // Confirmación de éxito: la mutación declara `meta.successToast` (texto del catálogo).
          onSuccess: (_data, _vars, _ctx, mutation) => {
            const msg = mutation.meta?.successToast;
            if (typeof msg === 'string') toast.success(msg);
          },
        }),
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* `reducedMotion="user"`: TODA animación de framer-motion respeta prefers-reduced-motion. */}
      <MotionConfig reducedMotion="user" transition={{ ease: EASE_STANDARD }}>
        {/* Marca light-first: el interior abre SIEMPRE en claro por defecto. `enableSystem={false}`
            para que no lo pise el tema oscuro del SO; el usuario puede elegir oscuro con el toggle
            (queda guardado como preferencia explícita). */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
