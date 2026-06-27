'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, RotateCcw, Send, Sparkles, Square, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAiStatus } from '@/lib/hooks';
import { useEntitlement } from '@/lib/entitlements';
import { api, ApiError } from '@/lib/api';
import type { AgentResponse, AgentStep, PendingWrite } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatMarkdown } from './chat-markdown';

type ChatMsg = { role: 'user' | 'assistant'; content: string; steps?: AgentStep[] };
type StreamEvent = { type: string; tool?: string; delta?: string } & Partial<AgentResponse>;

/** Etiquetas legibles del progreso por herramienta (thinking-traces) y de la traza posterior. */
const TOOL_LABELS: Record<string, string> = {
  search_matters: 'Buscando expedientes…',
  get_matter: 'Abriendo expediente…',
  list_open_tasks: 'Revisando plazos…',
  find_client: 'Buscando cliente…',
  list_documents: 'Listando documentos…',
  firm_overview: 'Revisando el despacho…',
  search_firm_knowledge: 'Buscando en documentos…',
  legal_research: 'Buscando jurisprudencia…',
  create_task: 'Preparando la tarea…',
  draft_and_save_document: 'Redactando el documento…',
};

/** Atajos de uso preconstruidos (skills): el botón rellena y envía un prompt accionable. */
const SKILLS: { label: string; prompt: string }[] = [
  {
    label: 'Panorámica del despacho',
    prompt:
      'Dame una panorámica del estado del despacho ahora mismo: expedientes activos, tareas abiertas y, sobre todo, los plazos vencidos. Organiza por urgencia y termina con qué atender primero.',
  },
  {
    label: 'Plazos urgentes',
    prompt:
      'Muéstrame las tareas y plazos abiertos ordenados por vencimiento, marcando claramente los vencidos. Indica para cada uno el expediente y qué acción requiere.',
  },
  {
    label: 'Estado de expediente',
    prompt:
      'Quiero el estado de un expediente. Pregúntame la referencia o el cliente, localízalo y resúmeme partes, materia, fase, tareas y documentos clave, con los próximos pasos sugeridos.',
  },
  {
    label: 'Buscar en documentos',
    prompt:
      'Busca dentro de los documentos del despacho lo que te indique (una cláusula, un importe, una fecha). Cita el documento y el expediente de cada resultado. Pregúntame qué quiero encontrar.',
  },
  {
    label: 'Jurisprudencia',
    prompt:
      'Ayúdame a localizar jurisprudencia y normativa sobre una cuestión jurídica, distinguiendo España o República Dominicana. Pregúntame el tema y la jurisdicción y dame enlaces a las fuentes oficiales.',
  },
  {
    label: 'Crear plazo/tarea',
    prompt:
      'Crea una tarea o plazo en un expediente. Pregúntame qué hay que hacer, en qué expediente y la fecha; muéstrame un resumen y pídeme confirmación antes de crearla.',
  },
  {
    label: 'Redactar escrito',
    prompt:
      'Redacta un borrador de escrito y guárdalo en el expediente. Pregúntame el tipo de escrito, el expediente y los datos esenciales; muéstrame el borrador y guárdalo solo tras mi confirmación.',
  },
  {
    label: 'Buscar cliente',
    prompt:
      'Localiza un cliente y dame su ficha. Pregúntame el nombre o identificador fiscal, y devuélveme sus datos, los expedientes en los que es parte y sus tareas o plazos abiertos.',
  },
];

function isStaff(roles: string[] | undefined): boolean {
  return Boolean(roles?.includes('FIRM_ADMIN') || roles?.includes('LAWYER'));
}

/**
 * Dock de chat del ASISTENTE AGÉNTICO (abajo-derecha). Conversación multi-turno EN STREAMING contra
 * `POST /ai/agent/stream`: muestra el progreso en vivo (qué herramienta está usando = thinking-traces) y
 * permite DETENER el turno (botón Stop). Solo staff con la IA habilitada; si no, no se monta. El historial
 * vive en el cliente y se reenvía en cada turno; las escrituras requieren confirmación (HITL).
 */
export function AiAgentDock() {
  const t = useTranslations('ai.agent');
  const { user } = useAuth();
  const { data: status } = useAiStatus();
  const hasAi = useEntitlement('ai');

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingWrite[] | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming, currentTool]);

  if (!isStaff(user?.roles) || !hasAi || !status?.enabled) return null;

  async function send(text: string, allowWrites = false) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setError(null);
    setPending(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setStreaming(true);
    setCurrentTool(null);
    setStreamingText('');
    const controller = new AbortController();
    abortRef.current = controller;
    let final: AgentResponse | null = null;
    try {
      await api.stream(
        '/ai/agent/stream',
        { message: trimmed, history, allowWrites },
        {
          signal: controller.signal,
          onEvent: (e) => {
            const ev = e as StreamEvent;
            if (ev.type === 'tool') setCurrentTool(ev.tool ?? null);
            else if (ev.type === 'text') {
              setCurrentTool(null);
              setStreamingText((prev) => prev + (ev.delta ?? ''));
            } else if (ev.type === 'done') {
              final = {
                output: ev.output ?? '',
                steps: ev.steps ?? [],
                model: ev.model ?? null,
                stopReason: ev.stopReason ?? 'stop',
                pendingWrites: ev.pendingWrites ?? [],
              };
            }
          },
        },
      );
      if (!final) throw new Error('sin respuesta');
      const done: AgentResponse = final;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: done.output, steps: done.steps },
      ]);
      if (done.pendingWrites.length > 0) setPending(done.pendingWrites);
    } catch (err) {
      // Quita el turno optimista (mantiene el historial válido) y restaura el texto. Un abort (Stop) no
      // es un error: no se muestra mensaje.
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof ApiError ? err.message : t('error'));
      }
    } finally {
      setStreaming(false);
      setCurrentTool(null);
      setStreamingText('');
      abortRef.current = null;
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
          {messages.length > 0 && !streaming && (
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('newChat')}
              onClick={() => {
                setMessages([]);
                setError(null);
                setPending(null);
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

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && !streaming && (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <Sparkles className="mb-2 size-8 text-[var(--brand)] opacity-70" />
            <p className="text-sm font-medium">{t('emptyTitle')}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{t('emptyHint')}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {SKILLS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => void send(s.prompt)}
                  className="rounded-full border px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-[var(--brand)] hover:text-foreground"
                >
                  {s.label}
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
              {m.role === 'user' ? (
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              ) : (
                <ChatMarkdown content={m.content} />
              )}
              {m.steps && m.steps.length > 0 && (
                <p className="mt-1.5 border-t pt-1.5 text-[10.5px] text-muted-foreground">
                  {t('usedTools', {
                    tools: m.steps
                      .map((s) => TOOL_LABELS[s.tool]?.replace('…', '') ?? s.tool)
                      .join(', '),
                  })}
                </p>
              )}
            </div>
          </div>
        ))}
        {streaming && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm border bg-[var(--surface-1)] px-3 py-2 text-sm">
              <ChatMarkdown content={streamingText} />
            </div>
          </div>
        )}
        {streaming && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            {!streamingText && <Loader2 className="size-3.5 animate-spin" />}
            {!streamingText &&
              (currentTool ? (TOOL_LABELS[currentTool] ?? t('thinking')) : t('thinking'))}
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="ml-auto flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] hover:border-[var(--danger)] hover:text-[var(--danger)]"
            >
              <Square className="size-3" />
              {t('stop')}
            </button>
          </div>
        )}
        {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
      </div>

      {pending && !streaming && (
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
          disabled={streaming}
        />
        <Button type="submit" size="icon" disabled={streaming || !input.trim()}>
          {streaming ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
      <p className="px-3 pb-2 text-[10px] text-muted-foreground">{t('disclaimer')}</p>
    </div>
  );
}
