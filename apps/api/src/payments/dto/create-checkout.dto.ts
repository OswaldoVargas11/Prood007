import { IsString } from 'class-validator';

/** Solicita un enlace de pago online para una factura. */
export class CreateCheckoutDto {
  @IsString()
  invoiceId!: string;
}
