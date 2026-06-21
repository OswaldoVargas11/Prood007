/**
 * Motor de IA (primitiva de modelo) + embeddings. Es la capa de BAJO NIVEL sobre la que se construye el
 * `AiAssistantProvider` de alto nivel (redacción/resumen/revisión con citas, ver `ai-assistant.ts`).
 *
 * Diseño "enchufar el agente": el núcleo de la app depende SOLO de estas interfaces. Proveer un modelo
 * concreto (p. ej. Claude Opus 4.6) = registrar un `AiEngine` real vía `AI_ENGINE`. Sin clave de API, el
 * factory inyecta un motor DESHABILITADO (`isEnabled() === false`) y las features de IA se muestran
 * apagadas — nada se rompe. Cambiar de modelo = una variable de entorno; cambiar de proveedor = una clase.
 */

export type AiRole = 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

/**
 * Adjunto que el motor puede pasar al modelo si lo soporta nativamente (p. ej. Claude acepta PDF e
 * imágenes como bloques de documento). Si el motor no lo soporta, debe ignorarlo de forma segura.
 */
export interface AiAttachment {
  /** MIME, p. ej. 'application/pdf', 'image/png'. */
  mediaType: string;
  /** Contenido en base64 (sin prefijo data:). */
  dataBase64: string;
  name?: string;
}

export interface AiCompletionRequest {
  /** Instrucciones de sistema (persona/reglas). Se cachea como prefijo estable cuando el motor lo permite. */
  system?: string;
  messages: AiMessage[];
  attachments?: AiAttachment[];
  /** Tope de tokens de salida; el motor aplica además su propio máximo de seguridad. */
  maxTokens?: number;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiCompletion {
  text: string;
  usage?: AiUsage;
  /** Modelo que produjo la respuesta (eco del proveedor). */
  model?: string;
}

export interface AiEngine {
  /** ¿Hay un modelo configurado y listo para usar? Si no, las features de IA se muestran deshabilitadas. */
  isEnabled(): boolean;
  /** Identificador del modelo activo (p. ej. 'claude-opus-4-6'); null si está deshabilitado. */
  model(): string | null;
  complete(req: AiCompletionRequest): Promise<AiCompletion>;
}

export const AI_ENGINE = Symbol('AI_ENGINE');

/**
 * Embeddings para búsqueda semántica (RAG). Proveedor SEPARADO del motor de chat: Anthropic no ofrece
 * embeddings, así que aquí se enchufa otro (p. ej. Voyage). Gated por su propia clave; sin ella queda
 * deshabilitado y la búsqueda semántica cae a la búsqueda por texto existente.
 */
export interface EmbeddingsProvider {
  isEnabled(): boolean;
  /** Dimensión del vector que produce (debe cuadrar con la columna pgvector del esquema). */
  dimensions(): number;
  /** Devuelve un vector por cada texto de entrada, en el mismo orden. */
  embed(texts: string[]): Promise<number[][]>;
}

export const AI_EMBEDDINGS = Symbol('AI_EMBEDDINGS');
