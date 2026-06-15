import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/validation';

async function bootstrap() {
  // `rawBody: true` preserva el cuerpo crudo (para verificar la firma del webhook de Stripe).
  const app = await NestFactory.create(AppModule, { rawBody: true });

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
  // Limita el tamaño del cuerpo JSON (defensa frente a payloads abusivos).
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`LegalFlow API escuchando en http://localhost:${port}/api`);
}

void bootstrap();
