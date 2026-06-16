import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { Currency } from '@legalflow/domain';

/**
 * Cobro de provisión de tipo ANTICIPO de honorarios: emite factura de anticipo y acredita el retainer.
 * `amount` es la BASE imponible (honorarios); el IVA/ITBIS y la retención IRPF los calcula el provider.
 */
export class RecordAnticipoDto {
  @IsString()
  matterId!: string;

  /** Base imponible (honorarios anticipados), positiva, hasta 2 decimales. */
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  /** Código de retención (p. ej. IRPF_GENERAL en ES) si el cliente es retenedor. */
  @IsOptional()
  @IsString()
  withholdingTaxCode?: string;

  /** Descripción de la línea de la factura de anticipo (opcional). */
  @IsOptional()
  @IsString()
  description?: string;

  /** Moneda; si se indica debe coincidir con la del despacho (mono-moneda). */
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}
