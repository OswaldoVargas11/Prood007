/**
 * Extractor mínimo del cuerpo legible de un correo MIME crudo (el que reenvía el worker como `text`).
 * No es un parser completo: separa cabeceras del cuerpo, en multipart busca la parte text/plain (o
 * text/html como reserva), decodifica quoted-printable/base64 y limpia etiquetas HTML. Suficiente para
 * un extracto legible en la bandeja del expediente (evita guardar las cabeceras `Received:`).
 */

function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r?\n/g, '') // saltos de línea "blandos"
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodePart(headers: string, body: string): string {
  if (/content-transfer-encoding:\s*base64/i.test(headers)) {
    try {
      return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      return body;
    }
  }
  if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    return decodeQuotedPrintable(body);
  }
  return body;
}

function splitHeaders(block: string): { headers: string; body: string } {
  const sep = block.search(/\r?\n\r?\n/);
  if (sep < 0) return { headers: '', body: block };
  return { headers: block.slice(0, sep), body: block.slice(sep).replace(/^\r?\n\r?\n/, '') };
}

export function extractEmailBody(raw: string): string {
  if (!raw) return '';
  const { headers: topHeaders, body: topBody } = splitHeaders(raw);

  let body = topBody;
  const boundary = /boundary="?([^"\r\n;]+)"?/i.exec(topHeaders)?.[1];
  if (boundary) {
    const parts = topBody.split(`--${boundary}`);
    const decoded = parts
      .map((p) => splitHeaders(p))
      .filter((p) => /content-type:\s*text\//i.test(p.headers));
    const chosen =
      decoded.find((p) => /content-type:\s*text\/plain/i.test(p.headers)) ?? decoded[0];
    if (chosen) body = decodePart(chosen.headers, chosen.body);
  } else {
    body = decodePart(topHeaders, topBody);
  }

  return body
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
