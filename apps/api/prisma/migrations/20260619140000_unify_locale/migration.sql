-- Unificación de locales: un solo idioma de UI (`es`). Antes el locale del tenant era `es-ES`/`es-DO`
-- (uno por jurisdicción); ahora la jurisdicción gobierna la terminología fiscal y el idioma es único.
-- Cambio de DATOS (no de esquema): pone todos los despachos en `es`. Idempotente.
UPDATE "Tenant" SET "locale" = 'es' WHERE "locale" <> 'es';
