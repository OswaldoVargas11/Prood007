import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingsProvider } from '@legalflow/domain';
import { apiError } from '../../common/api-messages';

/**
 * Embeddings vía Voyage AI (Anthropic recomienda Voyage; Anthropic no ofrece endpoint de embeddings
 * propio). Gated por `VOYAGE_API_KEY`. Modelo por `AI_EMBEDDINGS_MODEL` (default `voyage-3`, 1024 dims).
 *
 * IMPORTANTE: la dimensión debe cuadrar con la columna `vector(N)` de la tabla `AiEmbedding` (migración).
 * Cambiar a un modelo de otra dimensión exige re-crear la columna y re-indexar.
 */
export class VoyageEmbeddingsProvider implements EmbeddingsProvider {
  private readonly model: string;
  private readonly dims: number;

  constructor(
    private readonly apiKey: string,
    config: ConfigService,
  ) {
    this.model = config.get<string>('AI_EMBEDDINGS_MODEL') || 'voyage-3';
    const d = Number(config.get<string>('AI_EMBEDDINGS_DIMENSIONS'));
    this.dims = Number.isFinite(d) && d > 0 ? d : 1024;
  }

  isEnabled(): boolean {
    return true;
  }

  dimensions(): number {
    return this.dims;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(apiError('ai.embeddingsFailed'));
    }
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return (json.data ?? []).map((d) => d.embedding);
  }
}
