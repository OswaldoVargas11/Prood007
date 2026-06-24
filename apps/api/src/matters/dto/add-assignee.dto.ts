import { IsString, IsNotEmpty } from 'class-validator';

/** Añade un letrado adicional al equipo del expediente (LAWYER o FIRM_ADMIN del despacho). */
export class AddAssigneeDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
