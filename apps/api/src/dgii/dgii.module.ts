import { Module } from '@nestjs/common';
import { DgiiConfig } from './dgii.config';
import { DgiiSubmissionService } from './dgii-submission.service';

/**
 * Motor de transmisión de e-CF a la DGII (Fase 1). Aún NO se importa en AppModule: el código está listo,
 * compila y se prueba (ver dgii-signer.spec.ts), pero queda INERTE hasta la Fase 2, que lo cablea a la
 * emisión de facturas DO + persiste el estado en `Invoice`.
 */
@Module({
  providers: [DgiiConfig, DgiiSubmissionService],
  exports: [DgiiConfig, DgiiSubmissionService],
})
export class DgiiModule {}
