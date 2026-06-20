import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateMatterDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  type?: string;

  // Presupuesto de honorarios (decimal en texto, p. ej. "5000.00"); cadena vacía "" = quitar presupuesto.
  @IsOptional()
  @IsString()
  @Matches(/^(\d{1,12}(\.\d{1,2})?)?$/, { message: 'budgetAmount inválido' })
  budgetAmount?: string;

  // Partes y procedimiento (cadena vacía "" = limpiar el campo; undefined lo deja como está).
  @IsOptional() @IsString() @MaxLength(200) opposingParty?: string;
  @IsOptional() @IsString() @MaxLength(40) opposingPartyTaxId?: string;
  @IsOptional() @IsString() @MaxLength(200) opposingCounsel?: string;
  @IsOptional() @IsString() @MaxLength(200) court?: string;
  @IsOptional() @IsString() @MaxLength(80) caseNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) proceduralPhase?: string;
}
