import { IsEnum } from 'class-validator';
import { MatterStatus } from '@legalflow/domain';

export class ChangeStatusDto {
  @IsEnum(MatterStatus)
  status!: MatterStatus;
}
