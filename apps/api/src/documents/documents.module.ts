import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  // IntegrationsModule aporta CloudFilesService (importar de Google Drive / OneDrive / SharePoint).
  imports: [IntegrationsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
