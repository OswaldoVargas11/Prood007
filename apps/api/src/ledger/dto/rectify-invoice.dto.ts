import { IsString, MaxLength, MinLength } from 'class-validator';

/** Causa de la rectificación (obligatoria: alimenta el registro fiscal Verifactu/e-CF y la cadena). */
export class RectifyInvoiceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
