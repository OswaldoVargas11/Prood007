import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Genera un documento en un expediente a partir de una plantilla del despacho. */
export class GenerateFromTemplateDto {
  @IsString()
  templateId!: string;

  @IsString()
  matterId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;
}
