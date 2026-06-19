-- Multi-moneda + formato de factura elegible.
-- 1) Nueva moneda USD (se inserta ANTES de DOP para conservar el orden del enum del schema EUR·USD·DOP).
ALTER TYPE "Currency" ADD VALUE IF NOT EXISTS 'USD' BEFORE 'DOP';

-- 2) Formato fiscal/presentación POR FACTURA (es = España/Verifactu · do = RD/e-CF), desacoplado de la
--    jurisdicción del tenant. Se añade nullable, se backfillea desde la jurisdicción del despacho y se
--    fija NOT NULL (las facturas existentes conservan el formato de su jurisdicción).
ALTER TABLE "Invoice" ADD COLUMN "invoiceFormat" "Jurisdiction";
UPDATE "Invoice" i SET "invoiceFormat" = t."jurisdiction" FROM "Tenant" t WHERE i."tenantId" = t."id";
ALTER TABLE "Invoice" ALTER COLUMN "invoiceFormat" SET NOT NULL;
