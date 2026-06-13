import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ComplianceModule } from './compliance/compliance.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClientsModule } from './clients/clients.module';
import { MattersModule } from './matters/matters.module';
import { DocumentsModule } from './documents/documents.module';
import { TasksModule } from './tasks/tasks.module';
import { LedgerModule } from './ledger/ledger.module';
import { MessagesModule } from './messages/messages.module';
import { PortalModule } from './portal/portal.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ComplianceModule,
    AuditModule,
    StorageModule,
    RealtimeModule,
    NotificationsModule,
    AuthModule,
    ClientsModule,
    MattersModule,
    DocumentsModule,
    TasksModule,
    LedgerModule,
    MessagesModule,
    PortalModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
