import { Module } from '@nestjs/common';
import { DunningService } from './dunning.service';
import { DunningController } from './dunning.controller';
import { InAppChannel } from './channels/in-app.channel';
import { DUNNING_CHANNELS } from './channels/dunning-channel';

/**
 * Motor de dunning. Los canales de entrega se registran en el multi-provider `DUNNING_CHANNELS`; hoy
 * solo IN_APP. EMAIL/SMS (Fase 2) se añaden aquí como nuevos dispatchers sin tocar el motor.
 */
@Module({
  controllers: [DunningController],
  providers: [
    DunningService,
    InAppChannel,
    {
      provide: DUNNING_CHANNELS,
      useFactory: (inApp: InAppChannel) => [inApp],
      inject: [InAppChannel],
    },
  ],
  exports: [DunningService],
})
export class DunningModule {}
