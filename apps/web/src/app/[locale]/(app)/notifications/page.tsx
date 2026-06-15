'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, CheckCircle2, FileCheck, MessageSquare, Bell } from 'lucide-react';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/lib/hooks';
import { getSocket } from '@/lib/socket';
import { groupNotifications, notificationKind, type NotificationKind } from '@/lib/notifications';
import { relativeTime } from '@/lib/activity';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const KIND_STYLE: Record<NotificationKind, { className: string; Icon: typeof Bell }> = {
  document: {
    className: 'bg-[var(--violet-soft,var(--brand-soft))] text-[var(--violet)]',
    Icon: FileCheck,
  },
  task: {
    className: 'bg-[var(--info-soft,var(--brand-soft))] text-[var(--info)]',
    Icon: CheckCircle2,
  },
  message: { className: 'bg-[var(--brand-soft)] text-[var(--brand)]', Icon: MessageSquare },
  other: { className: 'bg-accent text-muted-foreground', Icon: Bell },
};

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  // Tiempo real: refrescar al llegar una notificación nueva (misma sala user:<id> que la campana).
  useEffect(() => {
    const socket = getSocket();
    const onNew = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [qc]);

  const groups = useMemo(() => groupNotifications(data ?? []), [data]);
  const unreadIds = useMemo(() => (data ?? []).filter((n) => !n.readAt).map((n) => n.id), [data]);

  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--success-soft)] px-2 py-1 text-[10.5px] font-semibold text-[var(--success)]">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--success)]" />
            {t('live')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => unreadIds.length && markAll.mutate(unreadIds)}
          disabled={unreadIds.length === 0 || markAll.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <CheckCheck className="size-3.5" />
          {t('markAll')}
        </button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('loadError')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 text-sm font-medium text-[var(--brand)] hover:underline"
          >
            {t('retry')}
          </button>
        </div>
      )}

      {!isLoading && !isError && groups.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center">
          <Bell className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.bucket}>
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            {t(`group.${g.bucket}`)}
          </div>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {g.items.map((n, i) => {
              const { className, Icon } = KIND_STYLE[notificationKind(n.type)];
              const unread = !n.readAt;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => unread && markRead.mutate(n.id)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/60',
                    i > 0 && 'border-t',
                    unread && 'bg-[var(--brand-soft)]',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 flex-shrink-0 items-center justify-center rounded-[9px]',
                      className,
                    )}
                  >
                    <Icon className="size-[15px]" />
                  </span>
                  <div className="min-w-0 flex-1 pt-px">
                    <div className="text-[13px] font-semibold leading-snug">{n.title}</div>
                    {n.body && (
                      <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                        {n.body}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-[var(--text-subtle)]">
                      {relativeTime(n.createdAt)}
                    </div>
                  </div>
                  {unread && (
                    <span className="mt-1.5 size-2 flex-shrink-0 rounded-full bg-[var(--brand)]" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
