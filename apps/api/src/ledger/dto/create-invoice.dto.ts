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

  /** Código de retención sobre la base (p. ej. "IRPF_GENERAL" en ES). Opcional. */
  @IsOptional()
  @IsString()
  withholdingTaxCode?: string;

  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}
