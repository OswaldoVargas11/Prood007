'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FileText, Loader2, Sparkles } from 'lucide-react';
import { useAiStatus, useAskMatter, useSummarizeMatter } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import type { AiResponse } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Panel del Asistente de IA para un expediente: preguntar (anclado al contexto) y resumir, mostrando
 * la respuesta con sus avisos/confianza (las respuestas citan fuentes en el backend). Si la IA no está
 * configurada en el servidor (`status.enabled === false`), se muestra deshabilitado en vez de fallar.
 */
export function AiAssistantPanel({ matterId }: { matterId: string }) {
  const t = useTranslations('ai');
  const { data: status, isLoading } = useAiStatus();
  const ask = useAskMatter(matterId);
  const summarize = useSummarizeMatter(matterId);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  // IA no configurada en el servidor: tarjeta apagada, sin acciones.
  if (!status?.enabled) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 py-6 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium text-foreground">{t('title')}</p>
            <p className="mt-1">{t('disabled')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const pending = ask.isPending || summarize.isPending;

  async function run(action: 'ask' | 'summary') {
    setError(null);
    setResult(null);
    try {
      const res =
        action === 'ask' ? await ask.mutateAsync(question.trim()) : await summarize.mutateAsync();
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-[var(--brand)]" />
            {t('title')}
          </h3>
          {status.model && (
            <Badge variant="secondary" className="font-mono text-[11px]">
              {status.model}
            </Badge>
          )}
        </div>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder={t('askPlaceholder')}
          className="flex w-full rounded-md border bg-[var(--surface-1)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => run('ask')}
            disabled={pending || question.trim().length < 2}
          >
            {ask.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {t('ask')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => run('summary')} disabled={pending}>
            {summarize.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
            {t('summarize')}
          </Button>
        </div>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        {result && (
          <div className="space-y-3 rounded-lg border bg-[var(--surface-1)] p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.output}</p>
            <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
              <Badge variant={result.confidence >= 0.6 ? 'success' : 'warning'}>
                {t('confidence', { pct: Math.round(result.confidence * 100) })}
              </Badge>
              {result.citations.length > 0 && (
                <span>{t('citations', { n: result.citations.length })}</span>
              )}
            </div>
            {result.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5 text-[12px] text-amber-600">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {w}
              </p>
            ))}
            <p className="text-[11px] text-muted-foreground">{t('disclaimer')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
