import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Email-por-BCC al expediente — GATED. El despacho pone en copia oculta (BCC) una dirección única por
 * expediente; un worker (p. ej. Cloudflare Email Routing) reenvía el correo parseado a `POST /inbound-email`.
 * Sin `INBOUND_EMAIL_ENABLED=true` + `INBOUND_EMAIL_SECRET`, el endpoint queda inerte. Ver INBOUND_EMAIL_SETUP.md.
 *
 * Doble candado: (1) cabecera `x-inbound-secret` autentica al worker; (2) el token por expediente
 * (HMAC del matterId) autentica el vínculo, de modo que una dirección no se puede falsificar ni adivinar.
 */
export function inboundEmailEnabled(): boolean {
  return process.env.INBOUND_EMAIL_ENABLED === 'true' && Boolean(process.env.INBOUND_EMAIL_SECRET);
}

function secret(): string {
  return process.env.INBOUND_EMAIL_SECRET ?? '';
}

export function inboundDomain(): string {
  return process.env.INBOUND_EMAIL_DOMAIN ?? 'in.lawzora.com';
}

/** Token corto que liga el matterId; sin el secreto no se puede generar. */
export function matterToken(matterId: string): string {
  return createHmac('sha256', secret()).update(matterId).digest('base64url').slice(0, 16);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function verifyMatterToken(matterId: string, token: string): boolean {
  return safeEqual(matterToken(matterId), token || '');
}

export function verifyWorkerSecret(provided: string | undefined): boolean {
  if (!secret()) return false;
  return safeEqual(secret(), provided ?? '');
}

/** Dirección BCC del expediente: `archivar+<matterId>.<token>@<dominio>`. */
export function matterBccAddress(matterId: string): string {
  return `archivar+${matterId}.${matterToken(matterId)}@${inboundDomain()}`;
}

/** Extrae {matterId, token} de la dirección destinataria (admite `Nombre <addr>`). */
export function parseMatterAddress(to: string): { matterId: string; token: string } | null {
  const m = /<?([^<>\s]+@[^<>\s]+)>?/.exec(to || '');
  const addr = m?.[1] ?? '';
  const local = addr.split('@')[0] ?? '';
  const plus = local.split('+')[1]; // <matterId>.<token>
  if (!plus) return null;
  const dot = plus.lastIndexOf('.');
  if (dot <= 0) return null;
  return { matterId: plus.slice(0, dot), token: plus.slice(dot + 1) };
}
