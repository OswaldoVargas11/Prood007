import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ComplianceModule } from './compliance/compliance.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ComplianceModule,
    // E1+: AuthModule, ClientsModule, MattersModule, DocumentsModule, TasksModule,
    // LedgerModule, NotificationsModule, AuditModule… (ver PLAN.md).
  ],
  controllers: [HealthController],
})
export class AppModule {}
