import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AttachEmailDto {
  @IsString()
  @IsNotEmpty()
  matterId!: string;

  @IsString()
  @IsNotEmpty()
  externalId!: string;
}

export class SendEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  body!: string;
}
