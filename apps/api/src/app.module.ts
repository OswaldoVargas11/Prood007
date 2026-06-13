import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ComplianceModule } from './compliance/compliance.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { ClientsModule } from './clients/clients.module';
import { MattersModule } from './matters/matters.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ComplianceModule,
    AuditModule,
    AuthModule,
    ClientsModule,
    MattersModule,
    // E3+: DocumentsModule, TasksModule, LedgerModule, NotificationsModule… (ver PLAN.md).
  ],
  controllers: [HealthController],
})
export class AppModule {}
