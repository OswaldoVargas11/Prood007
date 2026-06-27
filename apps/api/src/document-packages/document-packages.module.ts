import { Module } from '@nestjs/common';
import { DocumentPackagesController } from './document-packages.controller';
import { DocumentPackagesService } from './document-packages.service';

@Module({
  controllers: [DocumentPackagesController],
  providers: [DocumentPackagesService],
  exports: [DocumentPackagesService],
})
export class DocumentPackagesModule {}
