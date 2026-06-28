-- Domicilio fiscal estructurado del despacho (encabeza facturas e identifica a la parte en el DPA).
-- Columnas nullable; los despachos existentes quedan sin domicilio hasta que lo completen.

ALTER TABLE "Tenant" ADD COLUMN "fiscalAddress" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "fiscalCity" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "fiscalPostalCode" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "fiscalCountry" TEXT;
