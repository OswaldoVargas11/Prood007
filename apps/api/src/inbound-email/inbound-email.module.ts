import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { InboundEmailController } from './inbound-email.controller';
import { InboundEmailService } from './inbound-email.service';

@Module({
  imports: [DocumentsModule], // para archivar los adjuntos como documentos cifrados del expediente
  controllers: [InboundEmailController],
  providers: [InboundEmailService],
})
export class InboundEmailModule {}
