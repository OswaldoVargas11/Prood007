import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentReviewStatus } from '@legalflow/domain';

export class ReviewDocumentDto {
  @IsEnum(DocumentReviewStatus)
  status!: DocumentReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
