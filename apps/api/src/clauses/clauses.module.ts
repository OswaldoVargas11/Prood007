import { Module } from '@nestjs/common';
import { ClausesController } from './clauses.controller';
import { ClausesService } from './clauses.service';

@Module({
  controllers: [ClausesController],
  providers: [ClausesService],
})
export class ClausesModule {}
