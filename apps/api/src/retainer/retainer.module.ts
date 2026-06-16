import { Module } from '@nestjs/common';
import { RetainerService } from './retainer.service';
import { RetainerController } from './retainer.controller';

/**
 * Provisión de fondos / retainer. PR-R2: motor de saldo (atómico, con `SELECT … FOR UPDATE` + guards)
 * + tipos no fiscales + lecturas. R2b añadirá la emisión de factura de anticipo reutilizando el motor.
 */
@Module({
  controllers: [RetainerController],
  providers: [RetainerService],
  exports: [RetainerService],
})
export class RetainerModule {}
