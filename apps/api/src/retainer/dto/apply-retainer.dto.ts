import { IsOptional, IsString, Matches } from 'class-validator';

/** Aplica saldo de provisión de un expediente al cobro de una de sus facturas. */
export class ApplyRetainerDto {
  @IsString()
  matterId!: string;

  @IsString()
  invoiceId!: string;

  /** Importe a aplicar; si se omite, el menor entre el pendiente de la factura y el saldo disponible. */
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount?: string;
}
