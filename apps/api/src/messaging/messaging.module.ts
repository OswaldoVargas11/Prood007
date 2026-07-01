import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { ChatDigestService } from './chat-digest.service';
import { ChatDigestCron } from './chat-digest.cron';
import { AuthModule } from '../auth/auth.module';

/**
 * Mensajería interna del despacho (chat social del staff): directorio + DM 1:1 + canal «General». Incluye el
 * resumen por correo de mensajes sin leer (`ChatDigestService` + `ChatDigestCron`, NEXT 1.1). Importa
 * AuthModule por el proveedor de correo (`MAIL_PROVIDER`) del canal email del resumen.
 */
@Module({
  imports: [AuthModule],
  controllers: [MessagingController],
  providers: [MessagingService, ChatDigestService, ChatDigestCron],
  exports: [MessagingService, ChatDigestService],
})
export class MessagingModule {}
