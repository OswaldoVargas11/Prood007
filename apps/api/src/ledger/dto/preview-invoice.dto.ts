import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Jurisdiction } from '@legalflow/domain';

/**
 * Línea para el pre-cálculo fiscal. A diferencia de la línea de emisión, NO exige descripción:
 * el preview solo necesita cantidad · precio · código de impuesto para calcular base/IVA/IRPF/ITBIS.
 */
export class PreviewInvoiceLineDto {
  @IsNumberString()
  quantity!: string;

  @IsNumberString()
  unitPrice!: string;

  /** Código de impuesto de la jurisdicción (p. ej. "IVA_STANDARD" en ES, "ITBIS_STANDARD" en RD). */
  @IsString()
  taxCode!: string;
}

/**
 * Entrada del endpoint de pre-cálculo (`POST /ledger/invoices/preview`). Read-only: no crea factura
 * ni cambia estado; solo devuelve los totales que produciría la emisión real con la misma matemática.
 */
export class PreviewInvoiceDto {
  /** Código de retención sobre la base (p. ej. "IRPF_GENERAL" en ES). No aplica en RD. */
  @IsOptional()
  @IsString()
  withholdingTaxCode?: string;

  /** Formato fiscal a previsualizar (es/do). Si se omite, la jurisdicción del despacho. */
  @IsOptional()
  @IsEnum(Jurisdiction)
  invoiceFormat?: Jurisdiction;

  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => PreviewInvoiceLineDto)
  lines!: PreviewInvoiceLineDto[];
}
