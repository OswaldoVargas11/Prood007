-- Backfill de "InvoiceSequence" desde las facturas ya emitidas. La migración 20260624120000 creó el
-- contador monótono pero SIN sembrarlo con los números pre-existentes (era COUNT(*)+1): todo tenant con
-- facturas anteriores al 24-jun arranca en 1, genera un número ya usado y choca con
-- "Invoice_tenantId_number_key" en cada emisión (el rollback deshace el incremento → atascado para
-- siempre). Siembra el contador con el MÁXIMO ya emitido por serie+año; GREATEST lo hace idempotente y
-- nunca retrocede un contador que ya avanzó. Solo numeración interna (serie-año-correlativo); los eNCF
-- de RD llevan su propio contador en "EcfSequence".
INSERT INTO "InvoiceSequence" ("tenantId", "scope", "value")
SELECT i."tenantId",
       split_part(i."number", '-', 1) || ':' || split_part(i."number", '-', 2),
       MAX(split_part(i."number", '-', 3)::int)
FROM "Invoice" i
WHERE i."number" ~ '^[A-Z]+-[0-9]{4}-[0-9]+$'
GROUP BY 1, 2
ON CONFLICT ("tenantId", "scope") DO UPDATE
    SET "value" = GREATEST("InvoiceSequence"."value", EXCLUDED."value");
