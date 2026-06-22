import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Reserva de cita desde el portal del cliente. */
export class CreateAppointmentDto {
  @IsString()
  @MinLength(1)
  lawyerId!: string;

  @IsOptional()
  @IsString()
  matterId?: string;

  /** Inicio de la franja elegida (ISO, tal cual la devolvió el endpoint de franjas). */
  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
