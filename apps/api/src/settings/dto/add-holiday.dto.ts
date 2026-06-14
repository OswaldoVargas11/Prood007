import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Alta de un festivo local del despacho. */
export class AddHolidayDto {
  /** Fecha del festivo en formato ISO yyyy-mm-dd. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe ser yyyy-mm-dd.' })
  date!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
