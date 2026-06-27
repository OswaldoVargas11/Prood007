import { Module } from '@nestjs/common';
import { SavedViewsService } from './saved-views.service';
import { SavedViewsController } from './saved-views.controller';

@Module({
  controllers: [SavedViewsController],
  providers: [SavedViewsService],
  exports: [SavedViewsService],
})
export class SavedViewsModule {}
