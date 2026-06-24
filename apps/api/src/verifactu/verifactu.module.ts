import { Module } from '@nestjs/common';
import { VerifactuCredentialService } from './verifactu-credential.service';
import { VerifactuController } from './verifactu.controller';

/**
 * Verifactu (ES): custodia del certificado de firma del despacho. Deja LISTA la subida del cert; la firma
 * del registro y la remisión a la AEAT se enchufan en certificación (ver docs/fiscal/FINISHING-CHECKLIST.md).
 */
@Module({
  controllers: [VerifactuController],
  providers: [VerifactuCredentialService],
  exports: [VerifactuCredentialService],
})
export class VerifactuModule {}
