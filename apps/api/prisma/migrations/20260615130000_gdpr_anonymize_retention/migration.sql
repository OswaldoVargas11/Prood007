-- RGPD / Ley 172-13 — gobernanza de datos (D-022).
--
-- Client.anonymizedAt: sello del derecho de SUPRESIÓN por ANONIMIZACIÓN (no hard-delete). El borrado
-- del titular choca con el AuditLog inmutable y con la conservación legal del expediente; el modelo
-- correcto es anonimizar/seudonimizar la PII y PRESERVAR el registro auditado y lo que la ley obliga
-- a conservar. La retención legal prevalece sobre la supresión.
--
-- Tenant.dataRegion / retentionMonths: residencia de datos (UE para ES; RD a definir) y política de
-- conservación CONFIGURABLE por despacho (metadato/política; NO dispara auto-purga: conservar gana).
--
-- Columnas nullable → seguro sobre BD con datos existentes. Los GRANT de tabla a legalflow_app /
-- legalflow_system cubren automáticamente las columnas nuevas (privilegio a nivel de tabla). Las
-- políticas RLS de Client/Tenant ya existen (son row-level, no por columna): nada que reaplicar.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3);

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "dataRegion" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "retentionMonths" INTEGER;
