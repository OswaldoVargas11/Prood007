import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validación global de DTOs (class-validator).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`LegalFlow API escuchando en http://localhost:${port}/api`);
}

void bootstrap();
