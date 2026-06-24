import { Module } from '@nestjs/common';
import { PresentationsService } from './presentations.service';
import {
  PresentationChecklistsController,
  PresentationTypesController,
} from './presentations.controller';

@Module({
  controllers: [PresentationTypesController, PresentationChecklistsController],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}
