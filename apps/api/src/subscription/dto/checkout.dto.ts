import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { BillingCycle } from '../plans';
import type { SubscriptionTierId } from '@legalflow/domain';

export class CheckoutDto {
  /** Plazas de staff a contratar (cantidad de la suscripción). */
  @IsInt()
  @Min(1)
  @Max(1000)
  seats!: number;

  /** Tier elegido. Si `founder` es true se ignora (Fundador = funciones Profesional, tarifa fundador). */
  @IsOptional()
  @IsIn(['ESENCIAL', 'PROFESIONAL', 'AVANZADO'])
  tier?: SubscriptionTierId;

  /** Ciclo de facturación: MONTHLY (defecto) · ANNUAL (2 meses gratis) · BIENNIAL (−25%). */
  @IsOptional()
  @IsIn(['MONTHLY', 'ANNUAL', 'BIENNIAL'])
  cycle?: BillingCycle;

  /** El despacho solicita acogerse al Plan Fundador (sujeto a cupo + prepago anual/bienal). */
  @IsOptional()
  @IsBoolean()
  founder?: boolean;
}
