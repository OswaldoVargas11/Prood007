import { Module } from '@nestjs/common';
import { LedgerModule } from '../../ledger/ledger.module';
import { DgiiModule } from '../dgii.module';
import { EcfCertificationService } from './ecf-certification.service';
import { EcfCertificationController } from './ecf-certification.controller';

/**
 * Simulacro de certificación e-CF (kit CerteCF de la DGII). Módulo APARTE de DgiiModule porque necesita
 * el flujo de emisión completo (LedgerService) y LedgerModule ya importa DgiiModule: colgarlo de DgiiModule
 * crearía un ciclo. Gated por DGII_ENV=test|cert (nunca prod) en el servicio.
 */
@Module({
  imports: [LedgerModule, DgiiModule],
  controllers: [EcfCertificationController],
  providers: [EcfCertificationService],
})
export class EcfCertificationModule {}
