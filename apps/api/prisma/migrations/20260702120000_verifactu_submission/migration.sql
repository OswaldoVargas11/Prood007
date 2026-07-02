-- Verifactu (AEAT, ES): registro de facturación generado en la emisión + ciclo de remisión VERI*FACTU.
-- (RD 1007/2023 + Orden HAC/1177/2024; obligatorio 1-ene/1-jul-2027 según RD-ley 15/2025.)
--
--  - `verifactuXml`/`verifactuHuella`/`verifactuSignedBy`: el XML del RegistroAlta (firmado XAdES-BES si
--    el despacho tiene certificado) y su huella AEAT, escritos EN EL INSERT de la emisión. Son parte del
--    registro fiscal inalterable: NO se conceden a UPDATE del rol de app (mismo régimen que
--    complianceRecord, ver 20260624120000_fiscal_audit_immutability).
--  - `verifactuStatus`/`Detail`/`Csv`/`SubmittedAt`/`Attempts`: ciclo de vida de la REMISIÓN a la AEAT
--    (columnas mutables; se conceden explícitamente, como las ecf*).
-- Cambios aditivos: no tocan la cadena interna (recordHash/previousRecordHash) ni datos existentes
-- (las facturas previas quedan NOT_APPLICABLE).

CREATE TYPE "VerifactuStatus" AS ENUM ('NOT_APPLICABLE', 'STUBBED', 'PENDING', 'ACCEPTED', 'ACCEPTED_WITH_ERRORS', 'REJECTED');

ALTER TABLE "Invoice" ADD COLUMN "verifactuXml" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "verifactuHuella" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "verifactuSignedBy" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "verifactuStatus" "VerifactuStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';
ALTER TABLE "Invoice" ADD COLUMN "verifactuStatusDetail" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "verifactuCsv" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "verifactuSubmittedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "verifactuAttempts" INTEGER NOT NULL DEFAULT 0;

-- Barrido global del cron de remisión (PENDING entre todos los tenants, rol de sistema).
CREATE INDEX "Invoice_verifactuStatus_idx" ON "Invoice"("verifactuStatus");

-- Inalterabilidad: tras 20260624120000 el rol de app solo tiene UPDATE de columnas enumeradas; las
-- columnas nuevas nacen SIN UPDATE. Se conceden SOLO las de ciclo de vida de la remisión (el XML, la
-- huella AEAT y el firmante quedan inalterables una vez emitidos).
GRANT UPDATE ("verifactuStatus", "verifactuStatusDetail", "verifactuCsv", "verifactuSubmittedAt", "verifactuAttempts")
    ON "Invoice" TO legalflow_app;
