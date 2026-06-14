'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { useMarkNotificationRead, useNotifications } from '@/lib/hooks';
import { getSocket } from '@/lib/socket';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function NotificationsBell() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const qc = useQueryClient();
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const unread = data?.filter((n) => !n.readAt).length ?? 0;

  // Tiempo real: el servidor une el socket a la sala user:<id>; refrescamos al recibir una notificación.
  useEffect(() => {
    const socket = getSocket();
    const onNew = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [qc]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('open')}>
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t('title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {(!data || data.length === 0) && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
          )}
          {data?.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.readAt && markRead.mutate(n.id)}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-accent',
                !n.readAt && 'bg-[var(--brand-soft)]',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-[var(--brand)]" />}
                {n.title}
              </span>
              {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
              <span className="text-[10px] text-muted-foreground">
                {formatDateTime(n.createdAt, locale)}
              </span>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
