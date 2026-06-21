import { ServiceUnavailableException } from '@nestjs/common';
import type { AiCompletion, AiEngine } from '@legalflow/domain';
import { apiError } from '../../common/api-messages';

/**
 * Motor de IA DESHABILITADO: lo inyecta el factory cuando no hay `ANTHROPIC_API_KEY`. Todo el cableado
 * de IA existe y compila; al usarse sin clave, responde 503 con un mensaje claro. La UI consulta
 * `isEnabled()` (vía `GET /ai/status`) para mostrar las features apagadas en vez de fallar.
 */
export class DisabledEngine implements AiEngine {
  isEnabled(): boolean {
    return false;
  }

  model(): string | null {
    return null;
  }

  async complete(): Promise<AiCompletion> {
    throw new ServiceUnavailableException(apiError('ai.notConfigured'));
  }
}
