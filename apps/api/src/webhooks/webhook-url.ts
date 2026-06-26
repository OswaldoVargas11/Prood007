import { BadRequestException } from '@nestjs/common';
import { apiError } from '../common/api-messages';

/** Rangos IPv4 privados/reservados que un webhook saliente NUNCA debe alcanzar (anti-SSRF). */
const PRIVATE_IPV4 = [
  /^127\./, // loopback
  /^10\./, // privada A
  /^192\.168\./, // privada C
  /^169\.254\./, // link-local (incluye metadata 169.254.169.254)
  /^0\./, // "this network"
  /^172\.(1[6-9]|2\d|3[01])\./, // privada B (172.16-172.31)
];

/** ¿El host es claramente interno/privado? Heurística por nombre/IP (sin resolución DNS). */
export function isPrivateWebhookHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true;
  }
  // IPv6 loopback / ULA (fc00::/7) / link-local (fe80::/10).
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return PRIVATE_IPV4.some((re) => re.test(h));
}

/**
 * Valida la URL de un webhook saliente: exige HTTPS y rechaza hosts internos/privados (anti-SSRF).
 * Defensa MVP por esquema + host: NO resuelve DNS, así que un host público que apunte a una IP interna
 * no se detecta aquí (limitación conocida y documentada en el ADR de webhooks). Devuelve la URL normalizada.
 */
export function assertSafeWebhookUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new BadRequestException(apiError('webhooks.invalidUrl'));
  }
  if (u.protocol !== 'https:') throw new BadRequestException(apiError('webhooks.httpsRequired'));
  if (isPrivateWebhookHost(u.hostname)) {
    throw new BadRequestException(apiError('webhooks.privateHostBlocked'));
  }
  return u.toString();
}
