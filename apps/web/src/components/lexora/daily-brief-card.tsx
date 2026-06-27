'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAiStatus } from '@/lib/hooks';
import { useEntitlement } from '@/lib/entitlements';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatMarkdown } from './chat-markdown';

/**
 * Resumen del día con IA en el dashboard: pide a `/ai/daily-brief` un brief accionable (plazos urgentes,
 * tareas, expedientes que requieren atención) a partir del agregado del panel y lo renderiza en Markdown.
 * Gated por el entitlement `ai` + estado del motor: si la IA está apagada, no se muestra (nada se rompe).
 */
export function DailyBriefCard() {
  const hasAi = useEntitlement('ai');
  const { data: status } = useAiStatus();
  const enabled = hasAi && Boolean(status?.enabled);

  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    api
      .get<{ brief: string }>('/ai/daily-brief')
      .then((r) => setBrief(r.brief))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (enabled) load();
    // Solo al activarse la IA; el brief no se recalcula en cada render (coste).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!enabled) return null;

  return (
    <Card className="border-[var(--brand)]/25 bg-gradient-to-br from-[var(--brand)]/[0.07] to-transparent">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--brand)]" />
          <h2 className="text-sm font-semibold">Resumen del día</h2>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Regenerar resumen"
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:text-[var(--brand)] disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : error ? (
          <p className="text-[12px] text-muted-foreground">
            No se pudo generar el resumen ahora mismo.{' '}
            <button type="button" onClick={load} className="underline hover:text-[var(--brand)]">
              Reintentar
            </button>
          </p>
        ) : brief ? (
          <ChatMarkdown content={brief} />
        ) : (
          <p className="text-[12px] text-muted-foreground">Sin novedades destacadas para hoy.</p>
        )}
      </CardContent>
    </Card>
  );
}
