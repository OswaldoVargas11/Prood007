import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';

@Module({
  imports: [LedgerModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
