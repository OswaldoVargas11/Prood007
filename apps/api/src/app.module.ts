import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { TenantContextInterceptor } from './prisma/tenant-context.interceptor';
import { SubscriptionInterceptor } from './subscription/subscription.interceptor';
import { ComplianceModule } from './compliance/compliance.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClientsModule } from './clients/clients.module';
import { MattersModule } from './matters/matters.module';
import { DocumentsModule } from './documents/documents.module';
import { TemplatesModule } from './templates/templates.module';
import { SignaturesModule } from './signatures/signatures.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { PlatformModule } from './platform/platform.module';
import { KycModule } from './kyc/kyc.module';
import { ReportsModule } from './reports/reports.module';
import { SearchModule } from './search/search.module';
import { TasksModule } from './tasks/tasks.module';
import { LedgerModule } from './ledger/ledger.module';
import { PaymentsModule } from './payments/payments.module';
import { DunningModule } from './dunning/dunning.module';
import { RetainerModule } from './retainer/retainer.module';
import { BillingModule } from './billing/billing.module';
import { MessagesModule } from './messages/messages.module';
import { PortalModule } from './portal/portal.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { ImportModule } from './import/import.module';
import { LeadsModule } from './leads/leads.module';
import { CalendarModule } from './calendar/calendar.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AiModule } from './ai/ai.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global (in-memory; para multi-instancia usar almacenamiento Redis).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    // Tareas programadas (cron). Descubre los @Cron de los providers (p. ej. el dunning diario).
    ScheduleModule.forRoot(),
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
    SignaturesModule,
    SubscriptionModule,
    PlatformModule,
    TemplatesModule,
    KycModule,
    ReportsModule,
    SearchModule,
    TasksModule,
    LedgerModule,
    PaymentsModule,
    DunningModule,
    RetainerModule,
    BillingModule,
    MessagesModule,
    PortalModule,
    DashboardModule,
    UsersModule,
    SettingsModule,
    ImportModule,
    LeadsModule,
    CalendarModule,
    IntegrationsModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [
    // Rate limiting global. Se ejecuta antes que la autenticación.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Fija el contexto de tenant por request (para RLS). Tras los guards (req.user ya está).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    // Muro de suscripción: bloquea (402) si la prueba caducó sin suscripción, salvo @AllowExpired.
    { provide: APP_INTERCEPTOR, useClass: SubscriptionInterceptor },
  ],
})
export class AppModule {}
