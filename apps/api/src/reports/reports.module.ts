import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { FiscalReportsService } from './fiscal-reports.service';
import { FiscalReportsController } from './fiscal-reports.controller';

@Module({
  controllers: [ReportsController, FiscalReportsController],
  providers: [ReportsService, FiscalReportsService],
})
export class ReportsModule {}
