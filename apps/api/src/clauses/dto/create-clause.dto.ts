import { IsString, MaxLength, MinLength } from 'class-validator';

/** Alta de una cláusula reutilizable del despacho. */
export class CreateClauseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;
}
