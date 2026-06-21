'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { useMatters } from '@/lib/hooks';
import { Link } from '@/i18n/navigation';
import { relativeTime } from '@/lib/activity';
import { Skeleton } from '@/components/ui/skeleton';
import type { Matter, Message } from '@/lib/types';

/**
 * Bandeja global de mensajes. No hay endpoint firm-wide; agregamos los hilos por expediente
 * (`GET /matters/:id/messages`) con useQueries (Tanda A: solo frontend, sin mock). Una conversación por
 * expediente con su último mensaje; enlaza al chat del expediente.
 */
export default function MessagesOverviewPage() {
  const t = useTranslations('messagesOverview');

  const mattersQuery = useMatters({ pageSize: 100 });
  const matters = useMemo<Matter[]>(() => mattersQuery.data?.items ?? [], [mattersQuery.data]);

  const messageQueries = useQueries({
    queries: matters.map((m) => ({
      queryKey: ['messages', m.id],
      queryFn: () => api.get<Message[]>(`/matters/${m.id}/messages`),
      enabled: matters.length > 0,
    })),
  });

  const conversations = useMemo(() => {
    return messageQueries
      .map((q, i) => {
        const matter = matters[i];
        if (!matter || !q.data || q.data.length === 0) return null;
        const last = q.data.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
        return { matter, last, count: q.data.length };
      })
      .filter((c): c is { matter: Matter; last: Message; count: number } => c !== null)
      .sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  }, [messageQueries, matters]);

  const loading =
    mattersQuery.isLoading || (matters.length > 0 && messageQueries.some((q) => q.isLoading));
  const isError = mattersQuery.isError;

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
      </div>

      {loading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {t('loadError')}
        </p>
      )}

      {!loading && !isError && conversations.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center">
          <MessageSquare className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      )}

      {!loading && !isError && conversations.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {conversations.map(({ matter, last, count }) => (
            <Link
              key={matter.id}
              href={`/matters/${matter.id}?tab=chat`}
              aria-label={`${matter.title} · ${matter.reference}`}
              className="flex w-full items-start gap-3 border-b px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-accent/60"
            >
              <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--brand)]">
                {matter.reference.slice(-4)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium">{matter.title}</span>
                  <span className="font-mono text-[10.5px] text-[var(--text-subtle)]">
                    {matter.reference}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                  <span className="font-medium text-foreground">{last.author.fullName}:</span>{' '}
                  {last.body}
                </div>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className="text-[10.5px] text-[var(--text-subtle)]">
                  {relativeTime(last.createdAt)}
                </span>
                <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
                  {count}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
