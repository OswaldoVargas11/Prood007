import { Module } from '@nestjs/common';
import { VerifactuCredentialService } from './verifactu-credential.service';
import { VerifactuSignerService } from './verifactu-signer.service';
import { VerifactuRegistroService } from './verifactu-registro.service';
import { VerifactuSubmissionService } from './verifactu-submission.service';
import { VerifactuConfig } from './verifactu.config';
import { VerifactuCron } from './verifactu.cron';
import { VerifactuController } from './verifactu.controller';

/**
 * Verifactu (ES): custodia del certificado de firma del despacho, generación + firma XAdES-BES del
 * registro de facturación EN LA EMISIÓN (lo invoca `LedgerService.emitInvoiceInTx` vía
 * `VerifactuRegistroService`) y REMISIÓN a la AEAT en modalidad VERI*FACTU (`VerifactuSubmissionService`
 * + cron de reintento), gated por `VERIFACTU_ENV` (ver docs/fiscal/FINISHING-CHECKLIST.md).
 */
@Module({
  controllers: [VerifactuController],
  providers: [
    VerifactuConfig,
    VerifactuCredentialService,
    VerifactuSignerService,
    VerifactuRegistroService,
    VerifactuSubmissionService,
    VerifactuCron,
  ],
  exports: [
    VerifactuConfig,
    VerifactuCredentialService,
    VerifactuSignerService,
    VerifactuRegistroService,
    VerifactuSubmissionService,
  ],
})
export class VerifactuModule {}
