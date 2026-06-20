import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/validation';

async function bootstrap() {
  // `rawBody: true` preserva el cuerpo crudo (para verificar la firma del webhook de Stripe).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Límite EXPLÍCITO del tamaño del cuerpo (defensa DoS por payloads abusivos). Las subidas de fichero
  // van por multipart/multer con sus propios límites; aquí se acota el JSON/urlencoded. `useBodyParser`
  // conserva el rawBody del webhook de Stripe.
  app.useBodyParser('json', { limit: '512kb' });
  app.useBodyParser('urlencoded', { limit: '512kb', extended: true });

  // Cabeceras de seguridad HTTP.
  app.use(helmet());

  // Validación global de DTOs (class-validator). Pipe compartido con los tests: el error lleva la
  // messageKey traducible 'validation.failed' + el detalle por campo para depurar/mostrar en UI.
  app.useGlobalPipes(createValidationPipe());

  // CORS restringido por configuración (lista separada por comas) o reflejo en desarrollo.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim());
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
