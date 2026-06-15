import { IsString, ValidateIf } from 'class-validator';

/** Asignación (o desasignación con `null`) del letrado responsable de un expediente. */
export class AssignLawyerDto {
  /** Id del letrado (LAWYER o FIRM_ADMIN del despacho); `null` para desasignar. */
  @ValidateIf((o) => o.lawyerId !== null)
  @IsString()
  lawyerId!: string | null;
}
