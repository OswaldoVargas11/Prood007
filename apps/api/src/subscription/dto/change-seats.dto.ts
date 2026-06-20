import { IsInt, Max, Min } from 'class-validator';

/** Cambio de plazas de la suscripción (sube/baja la quantity; prorrateado en la próxima factura). */
export class ChangeSeatsDto {
  @IsInt()
  @Min(1)
  @Max(999)
  seats!: number;
}
