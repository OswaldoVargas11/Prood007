import { Module } from '@nestjs/common';
import { SignaturesController } from './signatures.controller';
import { SignaturesWebhookController } from './signatures-webhook.controller';
import { SignaturesService } from './signatures.service';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';

/** Importa AuthModule por MAIL_PROVIDER (aviso al firmante) y DocumentsModule por DocumentsService
 * (guardar el documento firmado como nueva versión al recibir el webhook SIGNED). */
@Module({
  imports: [AuthModule, DocumentsModule],
  controllers: [SignaturesController, SignaturesWebhookController],
  providers: [SignaturesService],
  exports: [SignaturesService],
})
export class SignaturesModule {}
