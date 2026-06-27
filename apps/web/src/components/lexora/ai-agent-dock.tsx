'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAgent, useAiStatus } from '@/lib/hooks';
import { useEntitlement } from '@/lib/entitlements';
import { ApiError } from '@/lib/api';
import type { AgentStep, PendingWrite } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ChatMsg = { role: 'user' | 'assistant'; content: string; steps?: AgentStep[] };

function isStaff(roles: string[] | undefined): boolean {
  return Boolean(roles?.includes('FIRM_ADMIN') || roles?.includes('LAWYER'));
}

/**
 * Dock de chat del ASISTENTE AGÉNTICO (abajo-derecha, junto al de mensajería). Conversación multi-turno
 * contra `POST /ai/agent`: el agente consulta datos reales del despacho (expedientes, tareas, clientes,
 * jurisprudencia) y puede crear tareas o redactar borradores. Solo staff y con la IA habilitada; si no,
 * no se monta. El historial vive en el cliente (stateless en servidor) y se reenvía en cada turno.
 */
export function AiAgentDock() {
  const t = useTranslations('ai.agent');
  const { user } = useAuth();
  const { data: status } = useAiStatus();
  const hasAi = useEntitlement('ai');
  const agent = useAgent();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingWrite[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, agent.isPending]);

  // Gating: solo staff y con IA habilitada en el servidor + entitlement del plan.
  if (!isStaff(user?.roles) || !hasAi || !status?.enabled) return null;

  async function send(text: string, allowWrites = false) {
    const trimmed = text.trim();
    if (!trimmed || agent.isPending) return;
    setError(null);
    setPending(null);
    // Historial COMMITTEADO (sin el nuevo turno): lo que se envía al servidor.
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    try {
      const res = await agent.mutateAsync({ message: trimmed, history, allowWrites });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.output, steps: res.steps },
      ]);
      // HITL: si el agente propuso escrituras, pídelas confirmar antes de ejecutarlas.
      if (res.pendingWrites.length > 0) setPending(res.pendingWrites);
    } catch (e) {
      // Quita el turno optimista para no dejar el historial terminando en 'user' (rompería el siguiente
      // turno) y devuelve el texto al input para reintentar.
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('open')}
        className="fixed bottom-4 right-[5.5rem] z-40 flex size-12 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-lg transition-transform hover:scale-105 print:hidden"
      >
        <Sparkles className="size-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex h-[min(560px,calc(100vh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-[var(--surface-0,white)] shadow-2xl print:hidden">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-2 border-b bg-[var(--surface-1)] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-[var(--brand)]" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t('title')}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {status.model ?? t('subtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('newChat')}
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
            >
              <RotateCcw className="size-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('close')}
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Conversación */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && !agent.isPending && (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <Sparkles className="mb-2 size-8 text-[var(--brand)] opacity-70" />
            <p className="text-sm font-medium">{t('emptyTitle')}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{t('emptyHint')}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {[t('suggest1'), t('suggest2'), t('suggest3')].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-[var(--brand)] hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--brand)] px-3 py-2 text-sm text-white'
                  : 'max-w-[85%] rounded-2xl rounded-bl-sm border bg-[var(--surface-1)] px-3 py-2 text-sm'
              }
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              {m.steps && m.steps.length > 0 && (
                <p className="mt-1.5 border-t pt-1.5 text-[10.5px] text-muted-foreground">
                  {t('usedTools', { tools: m.steps.map((s) => s.tool).join(', ') })}
                </p>
              )}
            </div>
          </div>
        ))}
        {agent.isPending && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t('thinking')}
          </div>
        )}
        {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
      </div>

      {/* Confirmación HITL: el agente propuso una escritura; el letrado decide. */}
      {pending && !agent.isPending && (
        <div className="border-t bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
          <p className="text-[12px] font-medium text-amber-800 dark:text-amber-300">
            {t('confirmTitle')}
          </p>
          <ul className="mt-1 space-y-0.5">
            {pending.map((p, i) => (
              <li key={i} className="text-[12px] text-amber-900 dark:text-amber-200">
                • {p.summary}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void send(t('confirmReply'), true)}>
              <Check className="size-3.5" />
              {t('confirm')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPending(null)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Entrada */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t p-2.5"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          disabled={agent.isPending}
        />
        <Button type="submit" size="icon" disabled={agent.isPending || !input.trim()}>
          {agent.isPending ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
      <p className="px-3 pb-2 text-[10px] text-muted-foreground">{t('disclaimer')}</p>
    </div>
  );
}
