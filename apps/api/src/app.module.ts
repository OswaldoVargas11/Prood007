import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { TenantContextInterceptor } from './prisma/tenant-context.interceptor';
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
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global (in-memory; para multi-instancia usar almacenamiento Redis).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
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
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    // Rate limiting global. Se ejecuta antes que la autenticación.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Fija el contexto de tenant por request (para RLS). Tras los guards (req.user ya está).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
