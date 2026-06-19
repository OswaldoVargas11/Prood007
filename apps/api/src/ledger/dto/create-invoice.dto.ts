import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Currency, Jurisdiction } from '@legalflow/domain';

export class InvoiceLineDto {
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

export class CreateInvoiceDto {
  @IsString()
  matterId!: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  /** Vencimiento del cobro. Si se omite, se calcula como issueDate + plazo por defecto. */
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Código de retención sobre la base (p. ej. "IRPF_GENERAL" en ES). Opcional. */
  @IsOptional()
  @IsString()
  withholdingTaxCode?: string;

  /** Moneda de la factura (EUR/USD/DOP). Si se omite, la moneda por defecto del despacho. */
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  /** Formato fiscal de la factura (es = España · do = RD). Si se omite, la jurisdicción del despacho. */
  @IsOptional()
  @IsEnum(Jurisdiction)
  invoiceFormat?: Jurisdiction;

  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}
