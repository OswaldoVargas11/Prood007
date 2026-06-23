import type { ConfigService } from '@nestjs/config';

/**
 * Secreto de firma del JWT del SUPER-ADMIN de plataforma. Dedicado (`PLATFORM_JWT_SECRET`) para que el
 * token de plataforma NO comparta el secreto de los tokens de usuario: así un fallo que permita acuñar un
 * token de usuario no concede `platform: true`. Si no está configurado, cae a `JWT_ACCESS_SECRET` (no
 * rompe el deploy actual); en producción conviene fijar uno propio (ver validateProdEnv / .env.example).
 */
export function platformJwtSecret(config: ConfigService): string {
  return (
    config.get<string>('PLATFORM_JWT_SECRET') || config.getOrThrow<string>('JWT_ACCESS_SECRET')
  );
}
