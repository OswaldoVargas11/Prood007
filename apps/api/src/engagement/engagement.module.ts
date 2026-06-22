import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  imports: [DocumentsModule],
  controllers: [EngagementController],
  providers: [EngagementService],
})
export class EngagementModule {}
