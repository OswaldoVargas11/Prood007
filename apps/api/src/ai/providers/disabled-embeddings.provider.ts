import type { EmbeddingsProvider } from '@legalflow/domain';

/**
 * Embeddings DESHABILITADOS: factory por defecto si no hay `VOYAGE_API_KEY`. La búsqueda semántica (RAG)
 * detecta `isEnabled() === false` y cae limpiamente a la búsqueda por texto existente; no indexa ni falla.
 */
export class DisabledEmbeddingsProvider implements EmbeddingsProvider {
  isEnabled(): boolean {
    return false;
  }

  dimensions(): number {
    return 0;
  }

  async embed(): Promise<number[][]> {
    return [];
  }
}
