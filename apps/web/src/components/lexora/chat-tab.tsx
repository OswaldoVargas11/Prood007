'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCheck, Loader2, SendHorizonal } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useChatReads, useMarkChatRead, useMessages, useSendMessage } from '@/lib/hooks';
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
  const { data: reads } = useChatReads(matterId);
  const send = useSendMessage(matterId);
  const markRead = useMarkChatRead(matterId);
  const [text, setText] = useState('');
  const [online, setOnline] = useState<string[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingSent = useRef(0);

  const markReadMut = markRead.mutate;
  const doMarkRead = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    markReadMut();
  }, [markReadMut]);

  // Tiempo real: suscripción a la sala + presencia/typing/lectura.
  useEffect(() => {
    const socket = getSocket();
    const timers = typingTimers.current;
    const subscribe = () => socket.emit('matter:subscribe', { matterId });
    subscribe();
    socket.on('connect', subscribe);

    const onNew = (msg: { matterId?: string }) => {
      if (msg?.matterId !== matterId) return;
      void qc.invalidateQueries({ queryKey: ['messages', matterId] });
      doMarkRead();
    };
    const onRead = (e: { matterId?: string }) => {
      if (e?.matterId === matterId)
        void qc.invalidateQueries({ queryKey: ['chat-reads', matterId] });
    };
    const onPresence = (e: { matterId?: string; online?: string[] }) => {
      if (e?.matterId === matterId) setOnline(e.online ?? []);
    };
    const onTyping = (e: { matterId?: string; userId?: string; isTyping?: boolean }) => {
      if (e?.matterId !== matterId || !e.userId || e.userId === user?.userId) return;
      const uid = e.userId;
      clearTimeout(typingTimers.current[uid]);
      if (e.isTyping) {
        setTyping((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
        typingTimers.current[uid] = setTimeout(
          () => setTyping((prev) => prev.filter((u) => u !== uid)),
          4000,
        );
      } else {
        setTyping((prev) => prev.filter((u) => u !== uid));
      }
    };

    socket.on('message:new', onNew);
    socket.on('read:update', onRead);
    socket.on('presence:update', onPresence);
    socket.on('typing:update', onTyping);
    return () => {
      socket.emit('matter:unsubscribe', { matterId });
      socket.off('connect', subscribe);
      socket.off('message:new', onNew);
      socket.off('read:update', onRead);
      socket.off('presence:update', onPresence);
      socket.off('typing:update', onTyping);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [matterId, qc, user?.userId, doMarkRead]);

  // Marcar como leído al abrir y cuando cambian los mensajes (si el chat está visible).
  useEffect(() => {
    if (messages && messages.length > 0) doMarkRead();
  }, [messages, doMarkRead]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function emitTyping(isTyping: boolean) {
    const socket = getSocket();
    const now = Date.now();
    if (isTyping && now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    socket.emit('matter:typing', { matterId, isTyping });
  }

  // Nombres de los participantes (de los mensajes y de los acuses de lectura).
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages ?? []) map.set(m.author.id, m.author.fullName);
    for (const r of reads ?? []) if (r.fullName) map.set(r.userId, r.fullName);
    return map;
  }, [messages, reads]);

  // ¿Hasta cuándo han leído OTROS participantes? (para el acuse «Leído» del último mensaje propio).
  const othersLastRead = useMemo(() => {
    const others = (reads ?? []).filter((r) => r.userId !== user?.userId);
    if (others.length === 0) return null;
    return others.reduce<string | null>(
      (max, r) => (max === null || r.lastReadAt > max ? r.lastReadAt : max),
      null,
    );
  }, [reads, user?.userId]);

  const lastOwn = useMemo(() => {
    const own = (messages ?? []).filter((m) => m.authorId === user?.userId);
    return own.length ? own[own.length - 1] : null;
  }, [messages, user?.userId]);

  const onlineOthers = online.filter((id) => id !== user?.userId);
  const typingNames = typing.map((id) => nameById.get(id)).filter(Boolean) as string[];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    emitTyping(false);
    send.mutate(text.trim(), { onSuccess: () => setText('') });
  }

  return (
    <Card className="flex h-[28rem] flex-col">
      {/* Cabecera: presencia */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[12px] text-muted-foreground">
        <span
          className={cn(
            'size-2 rounded-full',
            onlineOthers.length > 0 ? 'bg-[var(--success)]' : 'bg-[var(--text-subtle)]',
          )}
        />
        {onlineOthers.length > 0
          ? t('onlineCount', { count: onlineOthers.length })
          : t('noneOnline')}
      </div>

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
            const isLastOwn = own && lastOwn?.id === m.id;
            const seen = isLastOwn && othersLastRead !== null && othersLastRead >= m.createdAt;
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
                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  {formatDateTime(m.createdAt, locale)}
                  {seen && (
                    <span className="flex items-center gap-0.5 text-[var(--brand)]">
                      <CheckCheck className="size-3" /> {t('read')}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
      </div>

      {/* Indicador «escribiendo…» */}
      <div className="h-5 px-4 text-[11px] italic text-muted-foreground">
        {typingNames.length > 0 &&
          (typingNames.length === 1 ? t('typingOne', { name: typingNames[0] }) : t('typingMany'))}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            emitTyping(e.target.value.length > 0);
          }}
          onBlur={() => emitTyping(false)}
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
