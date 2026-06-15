import { IsDateString, IsInt, IsNumberString, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateTimeEntryDto {
  @IsString()
  matterId!: string;

  @IsString()
  @MaxLength(300)
  description!: string;

  /** Minutos trabajados. */
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  minutes!: number;

  /** Tarifa por hora como string decimal (p. ej. "120.00"). */
  @IsNumberString()
  hourlyRate!: string;

  @IsDateString()
  workedAt!: string;
}
