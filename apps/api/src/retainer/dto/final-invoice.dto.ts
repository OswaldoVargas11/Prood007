import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Línea del SERVICIO completo de la factura final (importes positivos; el provider calcula impuestos). */
export class FinalInvoiceLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @IsNumberString()
  quantity!: string;

  @IsNumberString()
  unitPrice!: string;

  /** Código de impuesto de la jurisdicción (p. ej. "IVA_STANDARD" en ES, "ITBIS_STANDARD" en RD). */
  @IsString()
  taxCode!: string;
}

/**
 * Emisión de la FACTURA FINAL de cierre con DEDUCCIÓN del anticipo (D-027 (b)). Se factura el servicio
 * completo (líneas positivas) y se deducen las facturas de anticipo ya emitidas mediante líneas
 * negativas: el IVA acumulado = IVA del total, sin doble imposición. NO es una rectificativa (los
 * anticipos quedan inmutables). El caller aporta solo las líneas del servicio; la deducción la calcula
 * el servidor a partir de los anticipos del expediente.
 */
export class FinalInvoiceDto {
  @IsString()
  matterId!: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  /** Vencimiento del cobro. Si se omite, se calcula como issueDate + plazo por defecto. */
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Código de retención sobre la base neta (p. ej. "IRPF_GENERAL" en ES). Opcional. */
  @IsOptional()
  @IsString()
  withholdingTaxCode?: string;

  /** Líneas del servicio completo (sin las de deducción, que las añade el servidor). */
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => FinalInvoiceLineDto)
  lines!: FinalInvoiceLineDto[];
}
