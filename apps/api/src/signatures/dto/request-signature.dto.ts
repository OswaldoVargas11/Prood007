import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestSignatureDto {
  /** Versión concreta del documento que se envía a firmar. */
  @IsString()
  versionId!: string;

  /** Nombre del firmante destinatario. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  signerName!: string;

  /** Email del firmante destinatario. */
  @IsEmail()
  @MaxLength(320)
  signerEmail!: string;
}
