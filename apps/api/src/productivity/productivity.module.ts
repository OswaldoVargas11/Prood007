import { Module } from '@nestjs/common';
import { ProductivityCron } from './productivity.cron';
import { ProductivityController } from './productivity.controller';

/** Avisos de productividad (digest semanal de tiempo sin facturar + disparo manual). */
@Module({
  controllers: [ProductivityController],
  providers: [ProductivityCron],
})
export class ProductivityModule {}
