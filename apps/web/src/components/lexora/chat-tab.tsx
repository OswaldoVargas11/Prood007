'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, SendHorizonal } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useMessages, useSendMessage } from '@/lib/hooks';
import { getSocket } from '@/lib/socket';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function ChatTab({ matterId }: { matterId: string }) {
  const t = useTranslations('chat');
  const locale = useLocale();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: messages, isLoading, isError, refetch } = useMessages(matterId);
  const send = useSendMessage(matterId);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Tiempo real: suscribirse a la sala del expediente y refrescar al llegar un mensaje.
  useEffect(() => {
    const socket = getSocket();
    const subscribe = () => socket.emit('matter:subscribe', { matterId });
    subscribe();
    socket.on('connect', subscribe);
    const onNew = (msg: { matterId?: string }) => {
      if (msg?.matterId === matterId)
        void qc.invalidateQueries({ queryKey: ['messages', matterId] });
    };
    socket.on('message:new', onNew);
    return () => {
      socket.off('message:new', onNew);
      socket.off('connect', subscribe);
    };
  }, [matterId, qc]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    send.mutate(text.trim(), { onSuccess: () => setText('') });
  }

  return (
    <Card className="flex h-[28rem] flex-col">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && (
          <div className="space-y-2 py-8 text-center">
            <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          </div>
        )}
        {!isLoading && !isError && messages?.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">{t('empty')}</p>
        )}
        {!isLoading &&
          !isError &&
          messages?.map((m) => {
            const own = m.authorId === user?.userId;
            return (
              <div key={m.id} className={cn('flex flex-col', own ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                    own
                      ? 'bg-[var(--brand)] text-[var(--primary-foreground)]'
                      : 'bg-[var(--surface-2)]',
                  )}
                >
                  {!own && (
                    <div className="mb-0.5 text-xs font-medium opacity-70">{m.author.fullName}</div>
                  )}
                  {m.body}
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatDateTime(m.createdAt, locale)}
                </span>
              </div>
            );
          })}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
        />
        <Button type="submit" size="icon" disabled={send.isPending || !text.trim()}>
          {send.isPending ? <Loader2 className="animate-spin" /> : <SendHorizonal />}
        </Button>
      </form>
    </Card>
  );
}
