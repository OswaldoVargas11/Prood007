import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cabeceras de seguridad HTTP.
  app.use(helmet());

  // Validación global de DTOs (class-validator).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // CORS restringido por configuración (lista separada por comas) o reflejo en desarrollo.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim());
  app.enableCors({ origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true, credentials: true });
  // Limita el tamaño del cuerpo JSON (defensa frente a payloads abusivos).
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`LegalFlow API escuchando en http://localhost:${port}/api`);
}

void bootstrap();
