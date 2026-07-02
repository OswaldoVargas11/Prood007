import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, ValidateNested } from 'class-validator';
import { DunningChannel, DunningSeverity } from '@legalflow/domain';

/** Canales permitidos desde Ajustes. SMS queda reservado (Fase 2) y no es seleccionable aquí. */
const SELECTABLE_CHANNELS = [DunningChannel.IN_APP, DunningChannel.EMAIL];

class DunningRuleChannelDto {
  @IsIn(Object.values(DunningSeverity))
  severity!: DunningSeverity;

  @IsIn(SELECTABLE_CHANNELS)
  channel!: DunningChannel;
}

/** Cambia el canal de una o varias etapas del calendario de dunning del despacho. Solo FIRM_ADMIN. */
export class UpdateDunningRulesDto {
  @ValidateNested({ each: true })
  @Type(() => DunningRuleChannelDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  rules!: DunningRuleChannelDto[];
}
