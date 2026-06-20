import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { IntakeController } from './intake.controller';
import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { MattersModule } from '../matters/matters.module';

@Module({
  imports: [AuthModule, ClientsModule, MattersModule],
  controllers: [LeadsController, IntakeController],
  providers: [LeadsService],
})
export class LeadsModule {}
