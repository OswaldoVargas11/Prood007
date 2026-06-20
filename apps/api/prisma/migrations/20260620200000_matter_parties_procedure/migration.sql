-- Partes y datos del procedimiento en el expediente. Todo OPCIONAL (nullable): un despacho que solo
-- asesora no rellena nada y el alta sigue igual de limpia.
--   · opposingParty / opposingPartyTaxId → contraparte (universal; alimenta el chequeo de conflicto).
--   · opposingCounsel / court / caseNumber / proceduralPhase → datos de litigación (sección plegable).
ALTER TABLE "Matter" ADD COLUMN "opposingParty" TEXT;
ALTER TABLE "Matter" ADD COLUMN "opposingPartyTaxId" TEXT;
ALTER TABLE "Matter" ADD COLUMN "opposingCounsel" TEXT;
ALTER TABLE "Matter" ADD COLUMN "court" TEXT;
ALTER TABLE "Matter" ADD COLUMN "caseNumber" TEXT;
ALTER TABLE "Matter" ADD COLUMN "proceduralPhase" TEXT;
