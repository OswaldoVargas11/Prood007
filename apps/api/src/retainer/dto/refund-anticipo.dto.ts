import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Devolución (REFUND) de un anticipo ya facturado (D-027 (c)). NO resta saldo sin más: emite una
 * **factura rectificativa** por SUSTITUCIÓN que reversa el anticipo (registro nuevo encadenado,
 * Verifactu R1 / e-CF nota de crédito), y registra un `RetainerEntry REFUND(−)`, atómico. La factura
 * de anticipo queda inmutable. El refund parcial / por diferencias queda fuera de R3c.
 */
export class RefundAnticipoDto {
  @IsString()
  matterId!: string;

  /** Factura de anticipo a devolver (debe ser un anticipo del expediente, no deducido ni ya devuelto). */
  @IsString()
  anticipoInvoiceId!: string;

  /** Causa de la rectificación (se registra en el documento fiscal). */
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
