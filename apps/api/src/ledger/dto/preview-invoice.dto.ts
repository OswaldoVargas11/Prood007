import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

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

  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => PreviewInvoiceLineDto)
  lines!: PreviewInvoiceLineDto[];
}
