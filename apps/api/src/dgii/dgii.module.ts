import { Module } from '@nestjs/common';
import { DgiiConfig } from './dgii.config';
import { DgiiSubmissionService } from './dgii-submission.service';
import { DgiiCredentialService } from './dgii-credential.service';
import { EcfTransmissionService } from './ecf-transmission.service';
import { DgiiController } from './dgii.controller';

/**
 * Transmisión de e-CF a la DGII (RD). GATED por DGII_ENV: sin él, las facturas quedan en STUBBED (no se
 * transmite, como hasta ahora). Expone el motor + la custodia del certificado del despacho; LedgerModule
 * lo usa para transmitir tras emitir una factura DO.
 */
@Module({
  controllers: [DgiiController],
  providers: [DgiiConfig, DgiiSubmissionService, DgiiCredentialService, EcfTransmissionService],
  exports: [DgiiConfig, DgiiSubmissionService, EcfTransmissionService, DgiiCredentialService],
})
export class DgiiModule {}
