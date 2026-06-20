import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { LeadStatus } from '@legalflow/domain';
import { CreateLeadDto } from './create-lead.dto';

/** Edición de un lead + movimiento en el embudo (status). */
export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}
