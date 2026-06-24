import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  /** Documento del expediente adjuntado al mensaje (opcional). */
  @IsOptional()
  @IsString()
  attachmentDocumentId?: string;
}

/** Alterna una reacción emoji del usuario sobre un mensaje. */
export class ReactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;
}
