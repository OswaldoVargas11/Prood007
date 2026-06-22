import { ArrayUnique, IsArray, IsBoolean, IsInt, Max, Min } from 'class-validator';

/** Disponibilidad del abogado para la auto-agenda. Horas en minutos desde medianoche (local). */
export class UpdateSchedulingConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @ArrayUnique()
  weekdays!: number[];

  @IsInt()
  @Min(0)
  @Max(1439)
  startMin!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMin!: number;

  @IsInt()
  @Min(5)
  @Max(240)
  slotMinutes!: number;
}
