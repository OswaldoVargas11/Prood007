import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { TaxService } from './tax.service';

/**
 * Capa de aceptación legal (clickwrap reforzado, sin proveedor de firma). Resuelve qué documentos vigentes
 * debe aceptar cada cuenta (por `accountType`) y los registra de forma auditable en `LegalAcceptance`.
 * PrismaService llega por el `PrismaModule` global.
 */
@Module({
  controllers: [LegalController],
  providers: [LegalService, TaxService],
  exports: [LegalService, TaxService],
})
export class LegalModule {}
