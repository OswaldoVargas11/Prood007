/**
 * Lógica PURA del resumen por correo de chat sin leer (NEXT 1.1). Aislada de la BD y del reloj para poder
 * probar los límites sin montar Nest: el servicio solo aporta los datos y cablea el resultado.
 *
 * Objetivo: avisar por correo a quien tiene mensajes del equipo sin leer, SIN spamear. Tres salvaguardas:
 *  1. VENTANA DE SILENCIO (`quietThresholdMs`): un mensaje recién llegado no dispara correo hasta que
 *     "reposa" — da margen a leerlo en vivo (Socket.IO) antes de mandar un email redundante.
 *  2. DEDUPE por marca (`lastDigestAt`): solo cuentan como novedad los mensajes POSTERIORES al último
 *     resumen enviado; el backlog ya avisado no se reenvía.
 *  3. INTERVALO MÍNIMO (`minIntervalMs`): nunca dos resúmenes al mismo usuario más seguidos que esto.
 */

/** Reposo mínimo de un mensaje antes de entrar en un resumen (da margen a leerlo en vivo). */
export const DEFAULT_QUIET_THRESHOLD_MS = 15 * 60_000; // 15 min
/** Intervalo mínimo entre dos resúmenes al mismo usuario (anti-spam). */
export const DEFAULT_MIN_INTERVAL_MS = 4 * 60 * 60_000; // 4 h

/** Un mensaje sin leer del usuario (de otro autor, posterior a su última lectura de esa conversación). */
export interface UnreadItem {
  conversationId: string;
  /** Etiqueta legible: «General» o el nombre del interlocutor del DM. */
  label: string;
  createdAt: Date;
}

/** Recuento de no leídos agrupado por conversación (para el cuerpo del correo). */
export interface ConversationSummary {
  conversationId: string;
  label: string;
  count: number;
}

export type DigestReason =
  | 'ok'
  | 'no_unread'
  | 'all_too_recent'
  | 'nothing_new'
  | 'rate_limited';

export interface DigestDecision {
  send: boolean;
  reason: DigestReason;
  /** Nº de mensajes NUEVOS (maduros y posteriores al último resumen) que motivan el envío. */
  totalCount: number;
  conversations: ConversationSummary[];
  /** Fecha del mensaje nuevo más reciente (null si no se envía). */
  newestAt: Date | null;
}

export interface DigestDecisionInput {
  unread: UnreadItem[];
  lastDigestAt: Date | null;
  now: Date;
  quietThresholdMs?: number;
  minIntervalMs?: number;
}

/**
 * Decide si enviar un resumen y con qué contenido. Orden de descarte (la razón es solo para trazas; lo que
 * importa es `send`): sin no leídos → todos demasiado recientes → nada nuevo desde el último → limitado por
 * intervalo → ok.
 */
export function decideChatDigest(input: DigestDecisionInput): DigestDecision {
  const quiet = input.quietThresholdMs ?? DEFAULT_QUIET_THRESHOLD_MS;
  const minInterval = input.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const nowMs = input.now.getTime();

  const none: Omit<DigestDecision, 'reason'> = {
    send: false,
    totalCount: 0,
    conversations: [],
    newestAt: null,
  };

  if (input.unread.length === 0) return { ...none, reason: 'no_unread' };

  // 1. Solo mensajes que ya "reposaron" la ventana de silencio.
  const mature = input.unread.filter((m) => nowMs - m.createdAt.getTime() >= quiet);
  if (mature.length === 0) return { ...none, reason: 'all_too_recent' };

  // 2. Dedupe: novedad = maduros posteriores al último resumen enviado.
  const fresh = input.lastDigestAt
    ? mature.filter((m) => m.createdAt.getTime() > input.lastDigestAt!.getTime())
    : mature;
  if (fresh.length === 0) return { ...none, reason: 'nothing_new' };

  // 3. Anti-spam: respeta el intervalo mínimo desde el último resumen.
  if (input.lastDigestAt && nowMs - input.lastDigestAt.getTime() < minInterval) {
    return { ...none, reason: 'rate_limited' };
  }

  return {
    send: true,
    reason: 'ok',
    totalCount: fresh.length,
    conversations: summarizeByConversation(fresh),
    newestAt: new Date(Math.max(...fresh.map((m) => m.createdAt.getTime()))),
  };
}

/** Agrupa los mensajes por conversación y ordena de más a menos ruidosa (desempate por etiqueta). */
export function summarizeByConversation(items: UnreadItem[]): ConversationSummary[] {
  const byId = new Map<string, ConversationSummary>();
  for (const it of items) {
    const cur = byId.get(it.conversationId);
    if (cur) cur.count++;
    else byId.set(it.conversationId, { conversationId: it.conversationId, label: it.label, count: 1 });
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** «1 mensaje» / «N mensajes» (es). */
export function pluralizeMessages(n: number): string {
  return n === 1 ? '1 mensaje' : `${n} mensajes`;
}

/** Líneas del cuerpo del correo: una por conversación, p. ej. «3 mensajes · Ana Pérez». */
export function chatDigestLines(conversations: ConversationSummary[]): string[] {
  return conversations.map((c) => `${pluralizeMessages(c.count)} · ${c.label}`);
}

/** Asunto del correo del resumen (es), en función del total de mensajes nuevos. */
export function chatDigestSubject(totalCount: number): string {
  return `Tienes ${pluralizeMessages(totalCount)} sin leer en el chat del despacho`;
}
