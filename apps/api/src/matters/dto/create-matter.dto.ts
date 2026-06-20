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

  /** Parte contraria (universal). Su nombre alimenta el chequeo de conflicto deontológico en el alta. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  opposingParty?: string;

  /** Id fiscal de la contraparte (afina el conflicto). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  opposingPartyTaxId?: string;

  /** Letrado de la parte contraria (litigación; opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  opposingCounsel?: string;

  /** Juzgado / tribunal (litigación; opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  court?: string;

  /** Nº de autos / procedimiento (litigación; opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  caseNumber?: string;

  /** Fase procesal (litigación; opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  proceduralPhase?: string;
}
