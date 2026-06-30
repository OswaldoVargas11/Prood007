import { Module } from '@nestjs/common';
import { VerifactuCredentialService } from './verifactu-credential.service';
import { VerifactuSignerService } from './verifactu-signer.service';
import { VerifactuController } from './verifactu.controller';

/**
 * Verifactu (ES): custodia del certificado de firma del despacho + firma XAdES-BES del registro. Deja LISTA
 * la subida del cert y la firma del registro; la REMISIÓN SOAP a la AEAT (VERI*FACTU) se enchufa en un
 * ticket aparte cuando haya banco de pruebas (ver docs/fiscal/FINISHING-CHECKLIST.md).
 */
@Module({
  controllers: [VerifactuController],
  providers: [VerifactuCredentialService, VerifactuSignerService],
  exports: [VerifactuCredentialService, VerifactuSignerService],
})
export class VerifactuModule {}
