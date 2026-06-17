import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DunningService } from './dunning.service';
import { DunningController } from './dunning.controller';
import { DunningCron } from './dunning.cron';
import { InAppChannel } from './channels/in-app.channel';
import { EmailChannel } from './channels/email.channel';
import { DUNNING_CHANNELS } from './channels/dunning-channel';

/**
 * Motor de dunning. Los canales de entrega se registran en el multi-provider `DUNNING_CHANNELS`:
 * IN_APP (aviso al despacho) y EMAIL (recordatorio al cliente). Ambos coexisten; el motor selecciona
 * por `rule.channel`. EMAIL delega en el `MailProvider` de AuthModule (SMTP si está configurado, Noop
 * en dev/CI) y es fail-soft (un fallo de correo no rompe el barrido). El cron diario (`DunningCron`)
 * lo descubre `ScheduleModule.forRoot()` declarado en `app.module`.
 */
@Module({
  imports: [AuthModule],
  controllers: [DunningController],
  providers: [
    DunningService,
    DunningCron,
    InAppChannel,
    EmailChannel,
    {
      provide: DUNNING_CHANNELS,
      useFactory: (inApp: InAppChannel, email: EmailChannel) => [inApp, email],
      inject: [InAppChannel, EmailChannel],
    },
  ],
  exports: [DunningService],
})
export class DunningModule {}
