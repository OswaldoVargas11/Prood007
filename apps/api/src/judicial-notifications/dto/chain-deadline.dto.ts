import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Encadena el plazo procesal desde la notificación (fecha de recepción → días hábiles + festivos). */
export class ChainDeadlineDto {
  @IsString()
  @MaxLength(80)
  deadlineType!: string;

  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
