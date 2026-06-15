import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { apiError } from './api-messages';

/**
 * Pipe de validación global compartido por producción (`main.ts`) y los tests e2e, para que el
 * contrato de error sea idéntico en ambos. Los fallos de validación salen por la messageKey
 * traducible `validation.failed` + el detalle por campo de class-validator.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const details = errors.map((e) => ({
        field: e.property,
        constraints: e.constraints ? Object.values(e.constraints) : [],
      }));
      return new BadRequestException(
        apiError('validation.failed', { params: { errors: details } }),
      );
    },
  });
}
