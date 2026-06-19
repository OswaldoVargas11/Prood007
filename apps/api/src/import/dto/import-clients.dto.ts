import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Importación de clientes desde CSV (texto plano). El backend parsea, valida cada fila (identificador
 * fiscal de cualquiera de las dos jurisdicciones, o pasaporte/otro) y deduplica por documento. El mismo
 * cuerpo sirve para PREVIEW (dry-run, no escribe) y COMMIT (crea los válidos no duplicados).
 */
export class ImportClientsDto {
  /** Contenido CSV con cabecera. Columnas reconocidas (alias es/en): nombre, documento/nif/rnc/cedula,
   *  tipo (FISCAL|PASSPORT|OTHER), email, telefono, direccion. */
  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000) // ~2 MB de CSV
  csv!: string;
}
