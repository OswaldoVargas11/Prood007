'use client';

import { useTranslations } from 'next-intl';
import { MessageSquare } from 'lucide-react';
import { useChatConversations } from '@/lib/hooks';
import { Link } from '@/i18n/navigation';
import { relativeTime } from '@/lib/activity';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Bandeja de conversaciones por expediente (`GET /messages/conversations`). El servidor acota las
 * conversaciones a los expedientes en los que el usuario participa (equipo asignado + cliente) y
 * calcula los no leídos. Enlaza al chat del expediente.
 */
export default function MessagesOverviewPage() {
  const t = useTranslations('messagesOverview');
  const { data: conversations, isLoading, isError } = useChatConversations();

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
      </div>

      {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {t('loadError')}
        </p>
      )}

      {!isLoading && !isError && (conversations ?? []).length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center">
          <MessageSquare className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      )}

      {!isLoading && !isError && (conversations ?? []).length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {(conversations ?? []).map((c) => (
            <Link
              key={c.matterId}
              href={`/matters/${c.matterId}?tab=chat`}
              aria-label={`${c.title} · ${c.reference}`}
              className="flex w-full items-start gap-3 border-b px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-accent/60"
            >
              <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--brand)]">
                {c.reference.slice(-4)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium">{c.title}</span>
                  <span className="font-mono text-[10.5px] text-[var(--text-subtle)]">
                    {c.reference}
                  </span>
                </div>
                {c.last && (
                  <div
                    className={cn(
                      'mt-0.5 truncate text-[12.5px]',
                      c.unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <span className="font-medium text-foreground">{c.last.authorName}:</span>{' '}
                    {c.last.body}
                  </div>
                )}
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className="text-[10.5px] text-[var(--text-subtle)]">
                  {c.last ? relativeTime(c.last.createdAt) : ''}
                </span>
                {c.unread > 0 && (
                  <span className="rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-semibold text-white tabular-nums">
                    {c.unread}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
