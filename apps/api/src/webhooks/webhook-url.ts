import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
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

/**
 * Cierra el hueco de la validación por nombre: RESUELVE el host por DNS y rechaza si CUALQUIER IP
 * resuelta es interna/privada (defiende de hosts públicos que apuntan a IPs internas / DNS rebinding).
 * Debe llamarse ANTES de cada envío (la resolución es el momento autoritativo; al alta podría cambiar).
 * Si el host no resuelve, se rechaza (no se entrega a un destino indeterminado).
 */
export async function assertResolvedHostSafe(hostname: string): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new BadRequestException(apiError('webhooks.privateHostBlocked'));
  }
  for (const { address } of addresses) {
    // Normaliza IPv4 mapeada en IPv6 (p. ej. ::ffff:10.0.0.1) para reusar las reglas IPv4.
    const ip = address.replace(/^::ffff:/i, '');
    if (isPrivateWebhookHost(ip)) {
      throw new BadRequestException(apiError('webhooks.privateHostBlocked'));
    }
  }
}

/** Validación completa para el momento del ENVÍO: esquema + host por nombre + IPs resueltas por DNS. */
export async function assertSafeWebhookUrlResolved(raw: string): Promise<string> {
  const url = assertSafeWebhookUrl(raw);
  await assertResolvedHostSafe(new URL(url).hostname);
  return url;
}
