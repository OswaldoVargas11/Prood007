import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Alta de un checklist de cierre en un expediente. `templateKey` opcional precarga las partidas de una
 * plantilla integrada (ver closing-templates.ts); si se omite, el checklist nace vacío.
 */
export class CreateChecklistDto {
  @IsString()
  matterId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  templateKey?: string;
}
