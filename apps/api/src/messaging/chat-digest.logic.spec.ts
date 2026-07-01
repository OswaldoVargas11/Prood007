import {
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_QUIET_THRESHOLD_MS,
  chatDigestLines,
  chatDigestSubject,
  decideChatDigest,
  pluralizeMessages,
  summarizeByConversation,
  type UnreadItem,
} from './chat-digest.logic';

/** Reloj fijo determinista (no depende del reloj real). */
const NOW = new Date('2026-07-01T12:00:00.000Z');
/** Mensaje a `minsAgo` minutos de NOW en la conversación/etiqueta dadas. */
function msg(minsAgo: number, conversationId = 'c1', label = 'General'): UnreadItem {
  return { conversationId, label, createdAt: new Date(NOW.getTime() - minsAgo * 60_000) };
}

describe('chat-digest selector', () => {
  it('no envía sin mensajes sin leer', () => {
    const d = decideChatDigest({ unread: [], lastDigestAt: null, now: NOW });
    expect(d.send).toBe(false);
    expect(d.reason).toBe('no_unread');
  });

  it('no envía si todos los mensajes son demasiado recientes (dentro de la ventana de silencio)', () => {
    // 10 min < 15 min de reposo.
    const d = decideChatDigest({ unread: [msg(10)], lastDigestAt: null, now: NOW });
    expect(d.send).toBe(false);
    expect(d.reason).toBe('all_too_recent');
  });

  it('envía cuando hay un mensaje maduro y nunca se avisó', () => {
    const d = decideChatDigest({ unread: [msg(20)], lastDigestAt: null, now: NOW });
    expect(d.send).toBe(true);
    expect(d.reason).toBe('ok');
    expect(d.totalCount).toBe(1);
    expect(d.newestAt).toEqual(new Date(NOW.getTime() - 20 * 60_000));
  });

  it('respeta el límite exacto de la ventana de silencio (>=, no >)', () => {
    const exactly = new Date(NOW.getTime() - DEFAULT_QUIET_THRESHOLD_MS);
    const d = decideChatDigest({
      unread: [{ conversationId: 'c1', label: 'General', createdAt: exactly }],
      lastDigestAt: null,
      now: NOW,
    });
    expect(d.send).toBe(true);
  });

  it('deduplica: no reenvía backlog ya avisado (nada nuevo desde el último resumen)', () => {
    // Mensaje de hace 60 min, ya cubierto por un resumen de hace 50 min.
    const d = decideChatDigest({
      unread: [msg(60)],
      lastDigestAt: new Date(NOW.getTime() - 50 * 60_000),
      now: NOW,
    });
    expect(d.send).toBe(false);
    expect(d.reason).toBe('nothing_new');
  });

  it('limita por intervalo mínimo aunque haya novedad madura', () => {
    // Novedad: mensaje de hace 20 min (posterior al último resumen de hace 30 min), pero 30 min < 4 h.
    const d = decideChatDigest({
      unread: [msg(20)],
      lastDigestAt: new Date(NOW.getTime() - 30 * 60_000),
      now: NOW,
    });
    expect(d.send).toBe(false);
    expect(d.reason).toBe('rate_limited');
  });

  it('reenvía pasado el intervalo mínimo si hay mensajes nuevos maduros', () => {
    const lastDigestAt = new Date(NOW.getTime() - (DEFAULT_MIN_INTERVAL_MS + 60_000));
    // Mensaje nuevo (posterior al último resumen) y maduro (30 min).
    const d = decideChatDigest({ unread: [msg(30)], lastDigestAt, now: NOW });
    expect(d.send).toBe(true);
    expect(d.totalCount).toBe(1);
  });

  it('solo cuenta como nuevos los mensajes posteriores a la marca (mezcla viejo+nuevo)', () => {
    const lastDigestAt = new Date(NOW.getTime() - (DEFAULT_MIN_INTERVAL_MS + 60_000));
    const old = new Date(lastDigestAt.getTime() - 10 * 60_000); // anterior a la marca → no cuenta
    const d = decideChatDigest({
      unread: [
        { conversationId: 'c1', label: 'General', createdAt: old },
        msg(30),
      ],
      lastDigestAt,
      now: NOW,
    });
    expect(d.send).toBe(true);
    expect(d.totalCount).toBe(1);
  });
});

describe('chat-digest agrupación y formateo', () => {
  it('agrupa por conversación y ordena de más a menos ruidosa', () => {
    const rows = summarizeByConversation([
      msg(20, 'c1', 'General'),
      msg(21, 'c2', 'Ana Pérez'),
      msg(22, 'c2', 'Ana Pérez'),
    ]);
    expect(rows).toEqual([
      { conversationId: 'c2', label: 'Ana Pérez', count: 2 },
      { conversationId: 'c1', label: 'General', count: 1 },
    ]);
  });

  it('pluraliza en español', () => {
    expect(pluralizeMessages(1)).toBe('1 mensaje');
    expect(pluralizeMessages(3)).toBe('3 mensajes');
  });

  it('formatea las líneas del cuerpo', () => {
    const lines = chatDigestLines([
      { conversationId: 'c2', label: 'Ana Pérez', count: 2 },
      { conversationId: 'c1', label: 'General', count: 1 },
    ]);
    expect(lines).toEqual(['2 mensajes · Ana Pérez', '1 mensaje · General']);
  });

  it('formatea el asunto', () => {
    expect(chatDigestSubject(1)).toBe('Tienes 1 mensaje sin leer en el chat del despacho');
    expect(chatDigestSubject(5)).toBe('Tienes 5 mensajes sin leer en el chat del despacho');
  });
});
