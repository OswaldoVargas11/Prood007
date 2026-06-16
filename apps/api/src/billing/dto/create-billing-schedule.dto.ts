import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BillingFiscalMode, BillingInterval, BillingScheduleType } from '@legalflow/domain';

/** Línea de la plantilla de facturación (concepto/cantidad/precio/taxCode). El provider calcula impuestos. */
export class BillingLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @IsNumberString()
  quantity!: string;

  @IsNumberString()
  unitPrice!: string;

  @IsString()
  taxCode!: string;
}

/**
 * Crea un plan de facturación programada (D-028). RECURRING = iguala (1 factura por periodo);
 * INSTALLMENTS = fraccionar un importe, con `fiscalMode` (SERVICE_RENDERED = 1 factura + cuotas-cobro;
 * ADVANCE = factura de anticipo por cuota). La emisión la hacen RP3/RP4; aquí solo se crea el plan y se
 * genera el cuadro de cuotas.
 */
export class CreateBillingScheduleDto {
  @IsString()
  matterId!: string;

  @IsEnum(BillingScheduleType)
  type!: BillingScheduleType;

  /** Solo INSTALLMENTS; por defecto SERVICE_RENDERED. Ignorado en RECURRING. */
  @IsOptional()
  @IsEnum(BillingFiscalMode)
  fiscalMode?: BillingFiscalMode;

  /** Cadencia (cada `intervalCount` × `intervalUnit`). Aplica a RECURRING y a la separación de cuotas. */
  @IsEnum(BillingInterval)
  intervalUnit!: BillingInterval;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  intervalCount?: number;

  /** RECURRING: nº de periodos a generar (null = abierto, el cron añade el siguiente en cada corrida). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  occurrences?: number;

  /** INSTALLMENTS: nº de cuotas (≥ 2). */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(120)
  installmentCount?: number;

  @IsDateString()
  startDate!: string;

  /** Retención (p. ej. IRPF_GENERAL en ES) aplicable a cada emisión, si procede. */
  @IsOptional()
  @IsString()
  withholdingTaxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => BillingLineDto)
  lines!: BillingLineDto[];
}
