import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { BillingCycle } from '../plans';

export class CheckoutDto {
  /** Plazas de staff a contratar (cantidad de la suscripción). */
  @IsInt()
  @Min(1)
  @Max(1000)
  seats!: number;

  /** Ciclo de facturación: MONTHLY (defecto) o ANNUAL (2 meses gratis). */
  @IsOptional()
  @IsIn(['MONTHLY', 'ANNUAL'])
  cycle?: BillingCycle;

  /** El despacho solicita acogerse al Plan Fundador (sujeto a cupo disponible). */
  @IsOptional()
  @IsBoolean()
  founder?: boolean;
}
