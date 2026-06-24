import type { ConfigService } from '@nestjs/config';

/**
 * Secreto de firma del JWT del SUPER-ADMIN de plataforma. Dedicado (`PLATFORM_JWT_SECRET`) para que el
 * token de plataforma NO comparta el secreto de los tokens de usuario: así un fallo que permita acuñar un
 * token de usuario no concede `platform: true`.
 *
 * En PRODUCCIÓN es FATAL: debe existir un `PLATFORM_JWT_SECRET` propio y NO puede coincidir con
 * `JWT_ACCESS_SECRET` (si coincidiera, el aislamiento sería ficticio). El fallback a `JWT_ACCESS_SECRET`
 * queda SOLO para dev/test, donde no romper el arranque local/CI pesa más que la separación estricta.
 */
export function platformJwtSecret(config: ConfigService): string {
  const dedicated = config.get<string>('PLATFORM_JWT_SECRET');
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    if (!dedicated) {
      throw new Error(
        'PLATFORM_JWT_SECRET es obligatorio en producción: el token del super-admin de plataforma ' +
          'debe firmarse con un secreto DEDICADO, no con JWT_ACCESS_SECRET.',
      );
    }
    if (dedicated === config.getOrThrow<string>('JWT_ACCESS_SECRET')) {
      throw new Error(
        'PLATFORM_JWT_SECRET no puede coincidir con JWT_ACCESS_SECRET: el aislamiento del token de ' +
          'plataforma frente a los tokens de usuario sería ficticio.',
      );
    }
    return dedicated;
  }
  // dev/test: fallback al secreto de acceso para no romper el arranque local/CI.
  return dedicated || config.getOrThrow<string>('JWT_ACCESS_SECRET');
}
