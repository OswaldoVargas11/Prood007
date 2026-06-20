import { IsNotEmpty, IsString } from 'class-validator';

/** Canje del ticket de un solo uso del login social por una sesión. */
export class SocialExchangeDto {
  @IsString()
  @IsNotEmpty()
  ticket!: string;
}
