-- AlterTable: ciclo de facturación (MONTHLY|ANNUAL) y Plan Fundador en Tenant.
-- ANNUAL = 2 meses gratis. Fundador = precio por plaza bloqueado de por vida según los tramos
-- vigentes al alta (snapshot en "lockedSeatTiers"); el precio sigue dependiendo del nº de plazas.
ALTER TABLE "Tenant" ADD COLUMN     "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "isFounder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "founderNumber" INTEGER,
ADD COLUMN     "lockedSeatTiers" JSONB;
