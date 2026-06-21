'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Copy, FileText, Loader2, Search, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAiStatus,
  useAskMatter,
  useDraftFromTemplate,
  useIndexMatter,
  useSemanticSearch,
  useSummarizeMatter,
  useTemplates,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import type { AiResponse, SemanticHit } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Hub de IA del expediente. Reúne las capacidades que tienen contexto de expediente: preguntar/resumir,
 * redactar desde plantilla y búsqueda semántica (RAG). Cada respuesta cita fuentes y muestra confianza/
 * avisos (D-011/AI Act). Si la IA no está configurada, se muestra deshabilitado en vez de fallar.
 */
export function AiAssistantPanel({ matterId }: { matterId: string }) {
  const t = useTranslations('ai');
  const { data: status, isLoading } = useAiStatus();

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

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

  return (
    <div className="space-y-4">
      {status.model && (
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-[var(--brand)]" />
            {t('title')}
          </h3>
          <Badge variant="secondary" className="font-mono text-[11px]">
            {status.model}
          </Badge>
        </div>
      )}
      <AskSummarizeCard matterId={matterId} />
      <TemplateDraftCard matterId={matterId} />
      <SemanticSearchCard matterId={matterId} searchEnabled={status.searchEnabled} />
    </div>
  );
}

/** Render común de una respuesta de IA: texto + confianza + citas + avisos + copiar. */
function ResultView({ result }: { result: AiResponse }) {
  const t = useTranslations('ai');
  return (
    <div className="space-y-3 rounded-lg border bg-[var(--surface-1)] p-3">
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
  );
}

/** Preguntar / resumir el expediente. */
function AskSummarizeCard({ matterId }: { matterId: string }) {
  const t = useTranslations('ai');
  const ask = useAskMatter(matterId);
  const summarize = useSummarizeMatter(matterId);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = ask.isPending || summarize.isPending;

  async function run(action: 'ask' | 'summary') {
    setError(null);
    setResult(null);
    try {
      setResult(
        action === 'ask' ? await ask.mutateAsync(question.trim()) : await summarize.mutateAsync(),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
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
        {result && <ResultView result={result} />}
      </CardContent>
    </Card>
  );
}

/** Redactar un borrador a partir de una plantilla del despacho + contexto del expediente. */
function TemplateDraftCard({ matterId }: { matterId: string }) {
  const t = useTranslations('ai');
  const { data: templates } = useTemplates();
  const draft = useDraftFromTemplate();
  const [templateId, setTemplateId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [result, setResult] = useState<AiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!templateId) return;
    setError(null);
    setResult(null);
    try {
      setResult(
        await draft.mutateAsync({ templateId, matterId, instructions: instructions.trim() }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h4 className="text-sm font-semibold">{t('draftTemplateTitle')}</h4>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t('draftTemplatePick')}</option>
          {(templates ?? []).map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={2}
          placeholder={t('draftTemplateInstructions')}
          className="flex w-full rounded-md border bg-[var(--surface-1)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button size="sm" onClick={run} disabled={draft.isPending || !templateId}>
          {draft.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
          {t('draftTemplateCta')}
        </Button>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {result && <ResultView result={result} />}
      </CardContent>
    </Card>
  );
}

/** Búsqueda semántica (RAG) + reindexar este expediente. Requiere embeddings (VOYAGE_API_KEY). */
function SemanticSearchCard({
  matterId,
  searchEnabled,
}: {
  matterId: string;
  searchEnabled: boolean;
}) {
  const t = useTranslations('ai');
  const search = useSemanticSearch();
  const reindex = useIndexMatter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SemanticHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (query.trim().length < 2) return;
    setError(null);
    try {
      setHits(await search.mutateAsync({ query: query.trim() }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  async function doReindex() {
    try {
      const res = await reindex.mutateAsync(matterId);
      toast.success(t('reindexed', { n: res.chunks }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('error'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{t('searchTitle')}</h4>
          <Button
            size="sm"
            variant="ghost"
            onClick={doReindex}
            disabled={!searchEnabled || reindex.isPending}
          >
            {reindex.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {t('reindex')}
          </Button>
        </div>
        {!searchEnabled ? (
          <p className="text-[12px] text-muted-foreground">{t('searchDisabled')}</p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && run()}
                placeholder={t('searchPlaceholder')}
                className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                size="sm"
                onClick={run}
                disabled={search.isPending || query.trim().length < 2}
              >
                {search.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
              </Button>
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            {hits && hits.length === 0 && (
              <p className="text-[12px] text-muted-foreground">{t('searchEmpty')}</p>
            )}
            {hits && hits.length > 0 && (
              <ul className="space-y-2">
                {hits.map((h, i) => (
                  <li key={i} className="rounded-md border bg-[var(--surface-1)] p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{h.refLabel}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {Math.round(h.score * 100)}%
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{h.excerpt}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
