'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUp, ChevronLeft, Hash, Loader2, Search, SmilePlus, Users, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  useConversationMessages,
  useDirectory,
  useMarkConversationRead,
  useMessagingConversations,
  useOpenDirect,
  useReactConversationMessage,
  useSendConversationMessage,
} from '@/lib/hooks';
import type { MessagingConversation } from '@/lib/types';
import { getSocket } from '@/lib/socket';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const QUICK_EMOJIS = ['👍', '✅', '🙏', '❤️', '😂', '🎉'];

/** Conversación activa seleccionada en el dock (resumen mínimo para la cabecera). */
type ActiveConversation = {
  id: string;
  kind: 'DIRECT' | 'CHANNEL';
  title: string | null;
  peer: { id: string; fullName: string } | null;
};

/**
 * Dock de mensajería interna (chat social del staff), anclado abajo a la derecha y presente en toda la
 * superficie del despacho. Lista el directorio de compañeros con su presencia en vivo, un canal «General»
 * de todo el equipo y conversaciones directas 1:1. Reutiliza el Socket.IO del resto de la app.
 *
 * Solo se monta en el shell del despacho (staff); los clientes no participan.
 */
export function MessagingDock({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('messaging');
  const qc = useQueryClient();
  const { user } = useAuth();
  const [active, setActive] = useState<ActiveConversation | null>(null);
  const [filter, setFilter] = useState('');
  const [online, setOnline] = useState<string[]>([]);

  const {
    data: directory,
    isLoading: dirLoading,
    isError: dirError,
    refetch: refetchDir,
  } = useDirectory();
  const { data: conversations } = useMessagingConversations();
  const openDirect = useOpenDirect();

  // Presencia del despacho + avisos de bandeja (badge/lista), aunque el dock esté cerrado.
  useEffect(() => {
    const socket = getSocket();
    const requestPresence = () => socket.emit('presence:request');
    requestPresence();
    socket.on('connect', requestPresence);
    const onPresence = (e: { online?: string[] }) => setOnline(e.online ?? []);
    const onInbox = () => {
      void qc.invalidateQueries({ queryKey: ['messaging-conversations'] });
      void qc.invalidateQueries({ queryKey: ['messaging-unread'] });
    };
    socket.on('presence:tenant', onPresence);
    socket.on('dm:inbox', onInbox);
    return () => {
      socket.off('connect', requestPresence);
      socket.off('presence:tenant', onPresence);
      socket.off('dm:inbox', onInbox);
    };
  }, [qc]);

  // Cerrar con Escape (patrón estándar de panel/slide-over).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // DM existente por id del compañero (para badge de no leídos + previsualización en el directorio).
  const dmByPeer = useMemo(() => {
    const map = new Map<string, MessagingConversation>();
    for (const c of conversations ?? []) {
      if (c.kind === 'DIRECT' && c.peer) map.set(c.peer.id, c);
    }
    return map;
  }, [conversations]);

  const people = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (directory ?? [])
      .filter((u) => !u.isSelf)
      .filter((u) => !q || u.fullName.toLowerCase().includes(q));
  }, [directory, filter]);

  const onlineSet = useMemo(() => new Set(online), [online]);

  function openConversation(c: ActiveConversation) {
    setActive(c);
  }

  async function openPerson(personId: string, fullName: string) {
    const existing = dmByPeer.get(personId);
    if (existing) {
      openConversation({ id: existing.id, kind: 'DIRECT', title: null, peer: existing.peer });
      return;
    }
    const conv = await openDirect.mutateAsync(personId);
    openConversation({
      id: conv.id,
      kind: 'DIRECT',
      title: null,
      peer: conv.peer ?? { id: personId, fullName },
    });
  }

  if (!user || !open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[min(420px,100vw)] flex-col border-l border-border bg-card shadow-2xl duration-200 animate-in slide-in-from-right print:hidden">
      {active ? (
        <ConversationView
          conversation={active}
          currentUserId={user.userId}
          isPeerOnline={active.peer ? onlineSet.has(active.peer.id) : false}
          onBack={() => setActive(null)}
          onClose={() => {
            setActive(null);
            onOpenChange(false);
          }}
        />
      ) : (
        <>
          {/* Cabecera */}
          <div
            className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-3"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in oklab, var(--brand) 8%, var(--card)), var(--card))',
            }}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-[30px] items-center justify-center rounded-[10px] bg-[var(--brand-soft)] text-[var(--brand)]">
                <Users className="size-4" />
              </span>
              <span className="text-[14px] font-semibold">{t('title')}</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t('close')}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Conversaciones: canal «General» + DMs con actividad (siempre visibles como filas) */}
            {(conversations ?? []).map((c) => {
              const isChannel = c.kind === 'CHANNEL';
              const name = isChannel ? t('general') : (c.peer?.fullName ?? '—');
              const isOnline = c.peer ? onlineSet.has(c.peer.id) : false;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    openConversation({ id: c.id, kind: c.kind, title: c.title, peer: c.peer })
                  }
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left hover:bg-accent"
                >
                  <span className="relative shrink-0">
                    <span
                      className={cn(
                        'flex size-9 items-center justify-center rounded-full text-xs font-semibold uppercase',
                        isChannel
                          ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                          : 'bg-[var(--surface-2)]',
                      )}
                    >
                      {isChannel ? <Hash className="size-4" /> : initials(name)}
                    </span>
                    {!isChannel && (
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card',
                          isOnline ? 'bg-[var(--success)]' : 'bg-[var(--text-subtle)]',
                        )}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {c.last?.body ?? (isChannel ? t('generalHint') : t('online'))}
                    </span>
                  </span>
                  {c.unread > 0 && <UnreadDot count={c.unread} />}
                </button>
              );
            })}

            {/* Iniciar conversación: directorio de compañeros del despacho */}
            <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('startChat')}
            </div>

            {/* Buscador de personas */}
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <Search className="size-3.5 text-muted-foreground" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('searchPeople')}
                  aria-label={t('searchPeople')}
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Directorio con estados explícitos (carga / error / vacío) — nunca un blanco silencioso */}
            {dirLoading && (
              <div className="space-y-2 px-4 py-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            )}
            {dirError && (
              <div className="space-y-2 px-4 py-4 text-center">
                <p className="text-[13px] text-[var(--danger)]">{t('directoryError')}</p>
                <Button size="sm" variant="outline" onClick={() => refetchDir()}>
                  {t('retry')}
                </Button>
              </div>
            )}
            {!dirLoading && !dirError && (
              <ul>
                {people.map((p) => {
                  const isOnline = onlineSet.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void openPerson(p.id, p.fullName)}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent"
                      >
                        <span className="relative shrink-0">
                          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold uppercase">
                            {initials(p.fullName)}
                          </span>
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card',
                              isOnline ? 'bg-[var(--success)]' : 'bg-[var(--text-subtle)]',
                            )}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.fullName}</span>
                          <span className="block truncate text-[11.5px] text-muted-foreground">
                            {isOnline ? t('online') : t('offline')}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {people.length === 0 && (
                  <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                    {filter ? t('noMatches') : t('noPeople')}
                  </li>
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function UnreadDot({ count }: { count: number }) {
  return (
    <span className="flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-semibold text-[var(--primary-foreground)] tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
}

/** Vista de una conversación abierta (DM o canal): mensajes, reacciones y envío en tiempo real. */
function ConversationView({
  conversation,
  currentUserId,
  isPeerOnline,
  onBack,
  onClose,
}: {
  conversation: ActiveConversation;
  currentUserId: string;
  isPeerOnline: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('messaging');
  const locale = useLocale();
  const qc = useQueryClient();
  const { id: conversationId, kind } = conversation;
  const { data: messages, isLoading } = useConversationMessages(conversationId);
  const send = useSendConversationMessage(conversationId);
  const react = useReactConversationMessage(conversationId);
  const markRead = useMarkConversationRead(conversationId);
  const [text, setText] = useState('');
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingSent = useRef(0);

  const title = kind === 'CHANNEL' ? t('general') : (conversation.peer?.fullName ?? '—');
  const markReadMut = markRead.mutate;
  const doMarkRead = useCallback(() => markReadMut(), [markReadMut]);

  // Nombres de autores (para el indicador «escribiendo…»).
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages ?? []) map.set(m.author.id, m.author.fullName);
    return map;
  }, [messages]);

  // Tiempo real: suscripción a la sala de la conversación.
  useEffect(() => {
    const socket = getSocket();
    const timers = typingTimers.current;
    const subscribe = () => socket.emit('conversation:subscribe', { conversationId });
    subscribe();
    socket.on('connect', subscribe);

    const onNew = (m: { conversationId?: string }) => {
      if (m?.conversationId !== conversationId) return;
      void qc.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
      doMarkRead();
    };
    const onReaction = (e: { conversationId?: string }) => {
      if (e?.conversationId === conversationId)
        void qc.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
    };
    const onTyping = (e: { conversationId?: string; userId?: string; isTyping?: boolean }) => {
      if (e?.conversationId !== conversationId || !e.userId || e.userId === currentUserId) return;
      const uid = e.userId;
      clearTimeout(typingTimers.current[uid]);
      if (e.isTyping) {
        const name = nameById.get(uid) ?? '';
        setTypingNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
        typingTimers.current[uid] = setTimeout(
          () => setTypingNames((prev) => prev.filter((n) => n !== (nameById.get(uid) ?? ''))),
          4000,
        );
      } else {
        const name = nameById.get(uid) ?? '';
        setTypingNames((prev) => prev.filter((n) => n !== name));
      }
    };

    socket.on('dm:new', onNew);
    socket.on('dm:reaction', onReaction);
    socket.on('dm:typing', onTyping);
    return () => {
      socket.emit('conversation:unsubscribe', { conversationId });
      socket.off('connect', subscribe);
      socket.off('dm:new', onNew);
      socket.off('dm:reaction', onReaction);
      socket.off('dm:typing', onTyping);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [conversationId, qc, currentUserId, doMarkRead, nameById]);

  // Marcar como leído al abrir / al llegar mensajes.
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
    socket.emit('conversation:typing', { conversationId, isTyping });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    emitTyping(false);
    send.mutate({ body: text.trim() }, { onSuccess: () => setText('') });
  }

  return (
    <>
      {/* Cabecera */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('back')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold uppercase">
          {kind === 'CHANNEL' ? <Hash className="size-3.5" /> : initials(title)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          {kind === 'DIRECT' && (
            <div className="text-[11px] text-muted-foreground">
              {isPeerOnline ? t('online') : t('offline')}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Mensajes */}
      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {isLoading && <Skeleton className="h-20 w-full" />}
        {!isLoading && messages?.length === 0 && (
          <p className="py-10 text-center text-[13px] text-muted-foreground">{t('empty')}</p>
        )}
        {messages?.map((m) => {
          const own = m.authorId === currentUserId;
          return (
            <div
              key={m.id}
              className={cn('group flex flex-col', own ? 'items-end' : 'items-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed',
                  own
                    ? 'rounded-br-md bg-[var(--brand)] text-white'
                    : 'rounded-bl-md bg-[var(--surface-2)]',
                )}
              >
                {kind === 'CHANNEL' && !own && (
                  <div className="mb-0.5 text-[11px] font-medium opacity-70">
                    {m.author.fullName}
                  </div>
                )}
                {m.body}
              </div>
              <div
                className={cn(
                  'mt-0.5 flex flex-wrap items-center gap-1',
                  own ? 'justify-end' : 'justify-start',
                )}
              >
                {Object.entries(m.reactions ?? {}).map(([emoji, ids]) => {
                  const mine = ids.includes(currentUserId);
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => react.mutate({ messageId: m.id, emoji })}
                      className={cn(
                        'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[11px]',
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
                      className="rounded-full px-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                    >
                      <SmilePlus className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={own ? 'end' : 'start'} className="flex gap-1 p-1">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => react.mutate({ messageId: m.id, emoji })}
                        className="rounded px-1.5 py-0.5 text-base hover:bg-accent"
                      >
                        {emoji}
                      </button>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <span className="mt-0.5 text-[10px] text-muted-foreground">
                {formatDateTime(m.createdAt, locale)}
              </span>
            </div>
          );
        })}
      </div>

      {/* «Escribiendo…» */}
      <div className="h-4 px-3 text-[11px] italic text-muted-foreground">
        {typingNames.length > 0 &&
          (typingNames.length === 1 ? t('typingOne', { name: typingNames[0] }) : t('typingMany'))}
      </div>

      {/* Envío */}
      <form onSubmit={submit} className="border-t border-border/60 p-2.5">
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-[var(--surface-1)] p-1.5 transition-colors focus-within:border-[var(--brand-line)] focus-within:ring-2 focus-within:ring-[var(--brand-soft)]">
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              emitTyping(e.target.value.length > 0);
            }}
            onBlur={() => emitTyping(false)}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            className="min-w-0 flex-1 bg-transparent px-2 text-[13.5px] outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={send.isPending || !text.trim()}
            aria-label={t('placeholder')}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </div>
      </form>
    </>
  );
}
