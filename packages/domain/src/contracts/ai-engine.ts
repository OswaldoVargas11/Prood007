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
  /**
   * Modelo a usar SOLO en esta llamada (p. ej. uno más barato para extracciones masivas). Si el motor no
   * lo soporta debe ignorarlo de forma segura y usar su modelo configurado.
   */
  model?: string;
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

/**
 * ── Capa AGÉNTICA (tool-use) ──────────────────────────────────────────────────────────────────────
 * Encima del `complete` one-shot, el motor puede ejecutar un turno con HERRAMIENTAS: el modelo pide una
 * acción (tool_use), el motor la ejecuta vía un callback que provee la app y le devuelve el resultado,
 * iterando hasta que el modelo responde sin más herramientas o se alcanza `maxSteps` (defensa anti-bucle).
 * La definición de las herramientas y su ejecución (acotada por tenant + permisos) viven en la app; el
 * motor solo orquesta el protocolo del proveedor. Así el asistente pasa de "sugerir" a "consultar datos
 * reales y actuar", sin acoplar el dominio a un proveedor concreto.
 */

/** Definición declarativa de una herramienta que el modelo puede invocar. */
export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON Schema del input (objeto). */
  inputSchema: Record<string, unknown>;
}

/** Invocación de una herramienta solicitada por el modelo. */
export interface AiToolInvocation {
  name: string;
  input: Record<string, unknown>;
}

/** Resultado de ejecutar una herramienta; `content` es lo que se devuelve al modelo. */
export interface AiToolOutcome {
  content: string;
  isError?: boolean;
}

/** Callback que la app provee al motor para ejecutar una herramienta pedida por el modelo. */
export type AiToolExecutor = (invocation: AiToolInvocation) => Promise<AiToolOutcome>;

/**
 * Hooks opcionales de streaming. Si se proveen, el motor emite el texto del modelo de forma incremental
 * (`onText` por cada delta) para el efecto "escribiendo en vivo". Si no, el turno funciona igual y el texto
 * llega solo en el resultado final (retrocompatible).
 *
 * `signal` permite CANCELAR el turno en curso (botón Stop del cliente): el motor lo propaga a la petición
 * del proveedor para cortar de verdad la generación en vuelo (deja de gastar tokens), no solo entre pasos.
 * Los motores que no lo soporten deben ignorarlo de forma segura.
 */
export interface AiAgentHooks {
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

/** Traza de un paso agéntico (para transparencia/auditoría). */
export interface AiAgentStep {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
}

export interface AiAgentRequest {
  /** Instrucciones de sistema (persona/reglas). */
  system?: string;
  /** Mensaje del usuario que inicia el turno agéntico. */
  userMessage: string;
  /**
   * Historial de conversación previo (texto plano user/assistant, en orden), para diálogos MULTI-TURNO.
   * Debe alternar y terminar en un turno de `assistant` (el `userMessage` es el nuevo turno de usuario).
   */
  history?: AiMessage[];
  /** Herramientas disponibles para este turno. */
  tools: AiToolDefinition[];
  /** Nº máximo de iteraciones de herramienta (el motor aplica además su propio tope de seguridad). */
  maxSteps?: number;
  maxTokens?: number;
}

export interface AiAgentResult {
  /** Respuesta final en texto del modelo. */
  text: string;
  /** Pasos de herramienta ejecutados, en orden. */
  steps: AiAgentStep[];
  usage?: AiUsage;
  model?: string;
  /** Motivo de parada final (p. ej. 'end_turn', 'max_steps'). */
  stopReason: string;
}

export interface AiEngine {
  /** ¿Hay un modelo configurado y listo para usar? Si no, las features de IA se muestran deshabilitadas. */
  isEnabled(): boolean;
  /** Identificador del modelo activo (p. ej. 'claude-opus-4-8'); null si está deshabilitado. */
  model(): string | null;
  complete(req: AiCompletionRequest): Promise<AiCompletion>;
  /**
   * Ejecuta un turno AGÉNTICO con tool-use. Los motores sin soporte (o deshabilitados) deben lanzar de
   * forma segura (p. ej. 503 ai.notConfigured) en vez de degradar silenciosamente.
   */
  runAgent(req: AiAgentRequest, exec: AiToolExecutor, hooks?: AiAgentHooks): Promise<AiAgentResult>;
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
