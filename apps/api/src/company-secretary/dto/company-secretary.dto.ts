import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMinuteDto {
  @IsOptional()
  @IsIn(['GENERAL_MEETING', 'BOARD', 'OTHER'])
  kind?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsISO8601()
  meetingDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;
}

export class CreateShareholderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxId?: string;

  @IsInt()
  @Min(0)
  units!: number;
}

export class UpdateShareholderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  units?: number;
}

export class CreateTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  toName!: string;

  @IsInt()
  @Min(1)
  units!: number;

  @IsISO8601()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

// Registros/oficinas por jurisdicción (ES: RM, RP, notaría/índice único; RD: Registro de Títulos, Cámara).
const REGISTRY_KINDS = [
  'REGISTRO_MERCANTIL',
  'REGISTRO_PROPIEDAD',
  'INDICE_UNICO_NOTARIAL',
  'NOTARIA',
  'REGISTRO_TITULOS_RD',
  'CAMARA_COMERCIO_RD',
  'OTHER',
] as const;

export class CreateObligationDto {
  @IsOptional()
  @IsIn(REGISTRY_KINDS)
  registry?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceCode?: string;

  @IsISO8601()
  dueDate!: string;

  @IsOptional()
  @IsIn(['NONE', 'ANNUAL'])
  recurrence?: string;
}

export class UpdateObligationDto {
  @IsOptional()
  @IsIn(REGISTRY_KINDS)
  registry?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceCode?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsIn(['NONE', 'ANNUAL'])
  recurrence?: string;

  @IsOptional()
  @IsIn(['PENDING', 'FILED'])
  status?: string;
}
