'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCheck, Loader2, Paperclip, SendHorizonal, SmilePlus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  useChatReads,
  useMarkChatRead,
  useMatterDocuments,
  useMessages,
  useReactMessage,
  useSendMessage,
} from '@/lib/hooks';
import { getSocket } from '@/lib/socket';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const QUICK_EMOJIS = ['👍', '✅', '🙏', '❓', '⚠️', '🎉'];

export function ChatTab({ matterId }: { matterId: string }) {
  const t = useTranslations('chat');
  const locale = useLocale();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: messages, isLoading, isError, refetch } = useMessages(matterId);
  const { data: reads } = useChatReads(matterId);
  const { data: docs } = useMatterDocuments(matterId);
  const send = useSendMessage(matterId);
  const react = useReactMessage(matterId);
  const markRead = useMarkChatRead(matterId);
  const [text, setText] = useState('');
  const [attach, setAttach] = useState<{ id: string; name: string } | null>(null);
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

    const onReaction = (e: { matterId?: string }) => {
      if (e?.matterId === matterId) void qc.invalidateQueries({ queryKey: ['messages', matterId] });
    };

    socket.on('message:new', onNew);
    socket.on('read:update', onRead);
    socket.on('presence:update', onPresence);
    socket.on('typing:update', onTyping);
    socket.on('message:reaction', onReaction);
    return () => {
      socket.emit('matter:unsubscribe', { matterId });
      socket.off('connect', subscribe);
      socket.off('message:new', onNew);
      socket.off('read:update', onRead);
      socket.off('presence:update', onPresence);
      socket.off('typing:update', onTyping);
      socket.off('message:reaction', onReaction);
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
    if (!text.trim() && !attach) return;
    emitTyping(false);
    send.mutate(
      {
        body: text.trim() || (attach ? `📎 ${attach.name}` : ''),
        attachmentDocumentId: attach?.id,
      },
      {
        onSuccess: () => {
          setText('');
          setAttach(null);
        },
      },
    );
  }

  function toggleReaction(messageId: string, emoji: string) {
    react.mutate({ messageId, emoji });
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
              <div
                key={m.id}
                className={cn('group flex flex-col', own ? 'items-end' : 'items-start')}
              >
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
                  {m.attachment && (
                    <div
                      className={cn(
                        'mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px]',
                        own ? 'bg-white/20' : 'bg-[var(--surface-1)]',
                      )}
                    >
                      <Paperclip className="size-3" />
                      <span className="max-w-[180px] truncate">{m.attachment.name}</span>
                    </div>
                  )}
                </div>

                {/* Reacciones + acción de reaccionar */}
                <div
                  className={cn(
                    'mt-1 flex flex-wrap items-center gap-1',
                    own ? 'justify-end' : 'justify-start',
                  )}
                >
                  {Object.entries(m.reactions ?? {}).map(([emoji, ids]) => {
                    const mine = !!user && ids.includes(user.userId);
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => toggleReaction(m.id, emoji)}
                        className={cn(
                          'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[11px] transition-colors',
                          mine
                            ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                            : 'border-border hover:bg-accent',
                        )}
                      >
                        {emoji} <span className="tabular-nums">{ids.length}</span>
                      </button>
                    );
                  })}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('react')}
                        className="rounded-full border border-transparent px-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                      >
                        <SmilePlus className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={own ? 'end' : 'start'} className="flex gap-1 p-1">
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => toggleReaction(m.id, emoji)}
                          className="rounded px-1.5 py-0.5 text-base hover:bg-accent"
                        >
                          {emoji}
                        </button>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
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

      {/* Adjunto seleccionado */}
      {attach && (
        <div className="mx-3 flex items-center gap-2 rounded-md bg-[var(--surface-2)] px-2 py-1 text-[12px]">
          <Paperclip className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{attach.name}</span>
          <button
            type="button"
            aria-label={t('removeAttachment')}
            onClick={() => setAttach(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
        {/* Adjuntar un documento del expediente */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon" variant="outline" aria-label={t('attach')}>
              <Paperclip className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
            {(docs ?? []).length === 0 && (
              <div className="px-2 py-1.5 text-[12px] text-muted-foreground">{t('noDocs')}</div>
            )}
            {(docs ?? []).map((d) => (
              <DropdownMenuItem
                key={d.id}
                onSelect={() => setAttach({ id: d.id, name: d.name })}
                className="text-[13px]"
              >
                <Paperclip className="size-3.5" />
                <span className="truncate">{d.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
        <Button type="submit" size="icon" disabled={send.isPending || (!text.trim() && !attach)}>
          {send.isPending ? <Loader2 className="animate-spin" /> : <SendHorizonal />}
        </Button>
      </form>
    </Card>
  );
}
