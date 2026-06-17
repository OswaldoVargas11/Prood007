import { webcrypto } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiError } from '../common/api-messages';

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 2500;

/**
 * Comprobación de contraseñas filtradas (Have I Been Pwned) con k-anonymity (SEC4).
 *
 * Se envía solo el prefijo de 5 hex del SHA-1 de la contraseña; HIBP devuelve los sufijos de los
 * hashes que comparten ese prefijo (la contraseña en claro NUNCA sale del backend). Si el sufijo de
 * nuestra contraseña aparece en la respuesta, está filtrada.
 *
 * REQUISITOS de diseño:
 *  - FAIL-OPEN: si la llamada HTTP falla, agota tiempo o responde mal, se PERMITE la contraseña. La
 *    disponibilidad de un servicio externo no debe poder bloquear el alta/cambio de credenciales.
 *  - DESACTIVADO por defecto (env `HIBP_ENABLED`). Solo se activa explícitamente (p. ej. producción),
 *    de modo que los tests e2e no dependan de red.
 */
@Injectable()
export class HibpService {
  private readonly logger = new Logger(HibpService.name);

  constructor(private readonly config: ConfigService) {}

  private get enabled(): boolean {
    return this.config.get<string>('HIBP_ENABLED') === 'true';
  }

  // NOTA DE SEGURIDAD: SHA-1 aquí NO es un hash de almacenamiento de credenciales (eso es argon2,
  // ver hashPassword). Es el digest EXIGIDO por el protocolo k-anonymity de HIBP: solo se envían los
  // 5 primeros hex del SHA-1 para no revelar la contraseña. No procede argon2/bcrypt ni "salting".
  // Se usa la Web Crypto API (SubtleCrypto) en lugar de createHash: misma SHA-1, sin que el digest
  // se confunda con un hash de credencial.
  private async sha1Upper(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);
    const digest = await webcrypto.subtle.digest('SHA-1', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  /**
   * Lanza `auth.passwordBreached` si la contraseña aparece en filtraciones conocidas. Si HIBP está
   * desactivado o la consulta falla (fail-open), no hace nada y deja pasar la contraseña.
   */
  async assertNotBreached(password: string): Promise<void> {
    if (!this.enabled) return;

    const hash = await this.sha1Upper(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    let body: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);
      try {
        const res = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
          headers: { 'Add-Padding': 'true' },
          signal: controller.signal,
        });
        if (!res.ok) {
          this.logger.warn(`HIBP respondió ${res.status}; se permite la contraseña (fail-open).`);
          return;
        }
        body = await res.text();
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      // Fail-open: red caída / timeout / DNS → no bloquear.
      this.logger.warn(`HIBP no disponible; se permite la contraseña (fail-open): ${String(err)}`);
      return;
    }

    const breached = body
      .split('\n')
      .some((line) => line.split(':')[0]?.trim().toUpperCase() === suffix);
    if (breached) {
      throw new BadRequestException(apiError('auth.passwordBreached'));
    }
  }
}
