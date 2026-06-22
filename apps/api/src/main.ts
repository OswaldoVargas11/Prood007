// Debe ir ANTES que cualquier otro import: inicializa Sentry y auto-instrumenta el framework (gated).
import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/validation';

/**
 * Validación fail-fast del entorno EN PRODUCCIÓN: aborta el arranque si faltan secretos críticos o son
 * débiles (< 32 bytes). No corre en dev/test (los e2e usan TestingModule, no este bootstrap).
 */
function validateProdEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;
  // FATAL: variables que DEBEN existir (su ausencia rompería la app igualmente). No tocan los valores.
  const missing = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'DATA_ENCRYPTION_KEY',
    'DATABASE_URL',
    'SYSTEM_DATABASE_URL',
    'CORS_ORIGINS',
    'PLATFORM_ADMIN_PASSWORD',
  ].filter((n) => !process.env[n]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables obligatorias en producción: ${missing.join(', ')}`);
  }
  // AVISO (no fatal, para no tumbar un despliegue vivo): calidad de los secretos. Surfacea en logs para
  // que el owner los endurezca/rote sin riesgo de crash-loop.
  const warn = (msg: string) => console.warn(`[seguridad] ${msg}`); // eslint-disable-line no-console
  for (const n of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATA_ENCRYPTION_KEY']) {
    if ((process.env[n] ?? '').length < 32) warn(`${n} es corto (<32); usa un valor más fuerte.`);
  }
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    warn('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deberían ser distintos.');
  }
}

async function bootstrap() {
  validateProdEnv();
  // `rawBody: true` preserva el cuerpo crudo (para verificar la firma del webhook de Stripe).
  // `bufferLogs: true` retiene los logs de arranque hasta enganchar el logger pino (líneas abajo).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  // Logs estructurados (JSON) con pino: cada request queda logueada con su id, método, status y latencia.
  // Sustituye al logger por defecto de Nest. Redacta cabeceras sensibles (ver LoggerModule en AppModule).
  app.useLogger(app.get(Logger));

  // Límite EXPLÍCITO del tamaño del cuerpo (defensa DoS por payloads abusivos). Las subidas de fichero
  // van por multipart/multer con sus propios límites; aquí se acota el JSON/urlencoded. `useBodyParser`
  // conserva el rawBody del webhook de Stripe.
  app.useBodyParser('json', { limit: '512kb' });
  app.useBodyParser('urlencoded', { limit: '512kb', extended: true });
  // Correo entrante por BCC (gated): el worker envía el MIME crudo (`message/rfc822`) para archivar el
  // cuerpo completo + adjuntos. Límite mayor acotado a ese content-type (no afecta al resto de rutas).
  app.useBodyParser('raw', { type: 'message/rfc822', limit: '30mb' });

  // Cabeceras de seguridad HTTP.
  app.use(helmet());

  // Validación global de DTOs (class-validator). Pipe compartido con los tests: el error lleva la
  // messageKey traducible 'validation.failed' + el detalle por campo para depurar/mostrar en UI.
  app.useGlobalPipes(createValidationPipe());

  // CORS restringido por configuración (lista separada por comas). En PRODUCCIÓN es fail-closed: si no
  // hay `CORS_ORIGINS`, se aborta el arranque (nunca reflejar cualquier origen con credenciales). En
  // desarrollo se permite el reflejo para comodidad local.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !(corsOrigins && corsOrigins.length > 0)) {
    throw new Error(
      'CORS_ORIGINS es obligatorio en producción (no se permite reflejar cualquier origen).',
    );
  }
  app.enableCors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`LegalFlow API escuchando en http://localhost:${port}/api`);
}

void bootstrap();
