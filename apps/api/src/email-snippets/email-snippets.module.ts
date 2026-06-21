import { Module } from '@nestjs/common';
import { EmailSnippetsController } from './email-snippets.controller';
import { EmailSnippetsService } from './email-snippets.service';

@Module({
  controllers: [EmailSnippetsController],
  providers: [EmailSnippetsService],
})
export class EmailSnippetsModule {}
