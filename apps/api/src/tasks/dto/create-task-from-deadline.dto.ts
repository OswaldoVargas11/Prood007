import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Crea una tarea cuya fecha límite la calcula el ComplianceProvider de la jurisdicción del tenant
 * (plazo procesal en días hábiles con festivos).
 */
export class CreateTaskFromDeadlineDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /** Tipo de plazo (p. ej. "APELACION"); específico por país. */
  @IsString()
  @MaxLength(80)
  deadlineType!: string;

  /** Fecha de inicio del cómputo (normalmente la notificación). */
  @IsDateString()
  startDate!: string;

  /** Número de días del plazo. */
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @IsOptional()
  @IsString()
  matterId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}
