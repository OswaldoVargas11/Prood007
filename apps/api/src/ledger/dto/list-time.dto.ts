import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Filtros del listado de tiempo (`GET /ledger/time`) para la captura de tiempo sin fricción.
 * - `mine=true`: solo las fichas del usuario autenticado (repaso del día).
 * - `unbilled=true`: solo tiempo aún no facturado (`billed=false`) — "tiempo sin facturar".
 * - `date`: acota a un día concreto (medianoche UTC a medianoche UTC).
 * - `matterId`: acota a un expediente.
 */
export class ListTimeQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  mine?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  unbilled?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  matterId?: string;
}
