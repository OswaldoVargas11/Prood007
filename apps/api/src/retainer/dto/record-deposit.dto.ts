import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { Currency, ProvisionKind } from '@legalflow/domain';

/** Registro de un cobro de provisión (depósito) en la cuenta de retainer de un expediente. */
export class RecordDepositDto {
  @IsString()
  matterId!: string;

  /** Importe positivo con hasta 2 decimales (string para no perder precisión). */
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  /** Naturaleza fiscal. En R2 solo SUPLIDO/GENERICO; ANTICIPO se rechaza (exige factura, PR-R2b). */
  @IsEnum(ProvisionKind)
  kind!: ProvisionKind;

  /** Moneda del cobro; si se indica debe coincidir con la del despacho (mono-moneda). */
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  note?: string;
}
