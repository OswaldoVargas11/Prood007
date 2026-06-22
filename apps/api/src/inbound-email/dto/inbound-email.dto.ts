import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Cuerpo que envía el worker de correo entrante (correo ya parseado). */
export class InboundEmailDto {
  /** Destinatario que recibió la copia (la dirección `archivar+<matterId>.<token>@…`). */
  @IsString()
  @MaxLength(320)
  to!: string;

  @IsString()
  @MaxLength(320)
  from!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  text?: string;
}
