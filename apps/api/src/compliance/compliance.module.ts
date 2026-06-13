import { Global, Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';

/**
 * ComplianceModule — expone ComplianceService globalmente para que cualquier módulo del núcleo
 * pueda resolver el provider del tenant sin importar implementaciones por país.
 */
@Global()
@Module({
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
