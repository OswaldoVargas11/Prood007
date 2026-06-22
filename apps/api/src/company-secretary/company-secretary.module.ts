import { Module } from '@nestjs/common';
import { CompanySecretaryController } from './company-secretary.controller';
import { CompanySecretaryService } from './company-secretary.service';

@Module({
  controllers: [CompanySecretaryController],
  providers: [CompanySecretaryService],
})
export class CompanySecretaryModule {}
