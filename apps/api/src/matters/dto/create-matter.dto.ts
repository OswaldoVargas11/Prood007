import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMatterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  /** Tipo de asunto (texto libre; el catálogo se gestiona en la capa de app/UI). */
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  type!: string;

  @IsString()
  clientId!: string;

  /** Abogado responsable (opcional al crear). */
  @IsOptional()
  @IsString()
  lawyerId?: string;

  /** Referencia interna; si se omite, se genera automáticamente. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reference?: string;
}
