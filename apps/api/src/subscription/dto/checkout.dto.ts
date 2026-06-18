import { IsInt, Max, Min } from 'class-validator';

export class CheckoutDto {
  /** Plazas de staff a contratar (cantidad de la suscripción). */
  @IsInt()
  @Min(1)
  @Max(1000)
  seats!: number;
}
