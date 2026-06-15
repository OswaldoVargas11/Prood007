import { IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Registro de un cobro manual sobre una factura (transferencia, efectivo, conciliación offline). */
export class RecordPaymentDto {
  @IsString()
  invoiceId!: string;

  /** Importe cobrado. Si se omite, se cobra el saldo pendiente completo. Permite cobros parciales. */
  @IsOptional()
  @IsNumberString()
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
