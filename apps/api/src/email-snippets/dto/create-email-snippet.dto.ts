import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Alta de una plantilla de correo del despacho (respuestas recurrentes). */
export class CreateEmailSnippetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}
