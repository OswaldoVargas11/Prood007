import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Registro manual de una notificación judicial recibida. */
export class CreateNotificationDto {
  @IsOptional()
  @IsString()
  matterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  court?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  procedureRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  /** Fecha de recepción de la notificación (inicio del cómputo del plazo). */
  @IsDateString()
  receivedAt!: string;
}
