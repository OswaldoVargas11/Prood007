import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Literales permitidos para los enums de la operación (validación de entrada).
const SIDES = ['BUYER', 'SELLER', 'COMPANY', 'LENDER', 'BORROWER', 'OTHER'] as const;
const ROLES = ['PRINCIPAL', 'LEGAL_COUNSEL', 'FINANCIAL_ADVISOR', 'NOTARY', 'OTHER'] as const;
const MILESTONE_KINDS = [
  'SIGNING',
  'CLOSING',
  'LONGSTOP',
  'CONDITIONS_DEADLINE',
  'FUNDS_FLOW',
  'FILING',
  'CUSTOM',
] as const;
const REGISTRY_KINDS = [
  'REGISTRO_MERCANTIL',
  'REGISTRO_PROPIEDAD',
  'INDICE_UNICO_NOTARIAL',
  'NOTARIA',
  'REGISTRO_TITULOS_RD',
  'CAMARA_COMERCIO_RD',
  'OTHER',
] as const;
const FUNDS_FLOW_KINDS = [
  'PAYMENT',
  'ESCROW_DEPOSIT',
  'ESCROW_RELEASE',
  'FEE',
  'ADJUSTMENT',
] as const;
const FUNDS_FLOW_STATUSES = ['PLANNED', 'SETTLED'] as const;
// Moneda ISO-4217 (3 letras mayúsculas). Por defecto EUR.
const CURRENCY_RE = /^[A-Z]{3}$/;

// ── Partes de la operación ────────────────────────────────────────────────────

export class CreatePartyDto {
  @IsOptional()
  @IsIn(SIDES)
  side?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isDistribution?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdatePartyDto {
  @IsOptional()
  @IsIn(SIDES)
  side?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isDistribution?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

// ── Hitos de la operación ─────────────────────────────────────────────────────

export class CreateMilestoneDto {
  @IsOptional()
  @IsIn(MILESTONE_KINDS)
  kind?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsISO8601()
  targetDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateMilestoneDto {
  @IsOptional()
  @IsIn(MILESTONE_KINDS)
  kind?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsISO8601()
  targetDate?: string;

  @IsOptional()
  @IsIn(['PENDING', 'DONE', 'MISSED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

// ── Funds flow (closing statement) ────────────────────────────────────────────

export class CreateFundsFlowLineDto {
  @IsOptional()
  @IsIn(FUNDS_FLOW_KINDS)
  kind?: string;

  /** Id de DealParty pagadora (validado en el servicio; '' / omitido = sin parte). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  payerPartyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  payeePartyId?: string;

  /** Importe como string decimal (p. ej. "1000000.00"). */
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @Matches(CURRENCY_RE)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  account?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  condition?: string;

  @IsOptional()
  @IsIn(FUNDS_FLOW_STATUSES)
  status?: string;
}

export class UpdateFundsFlowLineDto {
  @IsOptional()
  @IsIn(FUNDS_FLOW_KINDS)
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  payerPartyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  payeePartyId?: string;

  @IsOptional()
  @IsNumberString()
  amount?: string;

  @IsOptional()
  @Matches(CURRENCY_RE)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  account?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  condition?: string;

  @IsOptional()
  @IsIn(FUNDS_FLOW_STATUSES)
  status?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

// ── Escrow (depósito en garantía) ─────────────────────────────────────────────

export class CreateEscrowHoldingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  /** Importe retenido como string decimal. */
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @Matches(CURRENCY_RE)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  agent?: string;

  @IsOptional()
  @IsISO8601()
  depositedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  releaseTrigger?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateEscrowHoldingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsNumberString()
  amount?: string;

  @IsOptional()
  @Matches(CURRENCY_RE)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  agent?: string;

  @IsOptional()
  @IsISO8601()
  depositedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  releaseTrigger?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateEscrowReleaseDto {
  /** Importe a liberar como string decimal. No puede exceder el remanente (validado en el servicio). */
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsISO8601()
  releasedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

// ── Disclosure schedules ──────────────────────────────────────────────────────

export class CreateDisclosureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  repWarranty?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'AGREED'])
  status?: string;
}

export class UpdateDisclosureDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  repWarranty?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'AGREED'])
  status?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

// ── Presentaciones registrales ────────────────────────────────────────────────

export class CreateFilingDto {
  @IsOptional()
  @IsIn(REGISTRY_KINDS)
  registry?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateFilingDto {
  @IsOptional()
  @IsIn(REGISTRY_KINDS)
  registry?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceCode?: string;

  @IsOptional()
  @IsIn(['PENDING', 'SUBMITTED', 'REGISTERED', 'REJECTED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
