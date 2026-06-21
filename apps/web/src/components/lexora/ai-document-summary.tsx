'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Copy, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAiStatus, useSummarizeDocument } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import type { AiResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Botón "Resumir con IA" para un documento. Resume el contenido (PDF/imagen van al modelo de forma
 * nativa). Oculto si la IA no está configurada (no estorba). Muestra avisos/aviso legal del borrador.
 */
export function AiDocumentSummary({ documentId }: { documentId: string }) {
  const t = useTranslations('ai');
  const { data: status } = useAiStatus();
  const summarize = useSummarizeDocument();
  const [result, setResult] = useState<AiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status?.enabled) return null;

  async function run() {
    setError(null);
    setResult(null);
    try {
      setResult(await summarize.mutateAsync(documentId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-4 text-[var(--brand)]" />
            {t('title')}
          </span>
          <Button size="sm" variant="outline" onClick={run} disabled={summarize.isPending}>
            {summarize.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {t('summarizeDoc')}
          </Button>
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {result && (
          <div className="space-y-2 rounded-lg border bg-[var(--surface-1)] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.output}</p>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0"
                aria-label={t('copy')}
                onClick={() => {
                  void navigator.clipboard.writeText(result.output);
                  toast.success(t('copied'));
                }}
              >
                <Copy className="size-4" />
              </Button>
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
