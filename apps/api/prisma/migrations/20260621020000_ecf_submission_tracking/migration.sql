-- Estado de la transmisión del e-CF a la DGII (RD) en la factura + contraseña cifrada del certificado
-- .p12 del despacho. Cambios ADITIVOS (columnas nuevas + enum), sin tocar RLS ni datos existentes.

-- CreateEnum
CREATE TYPE "EcfStatus" AS ENUM ('NOT_APPLICABLE', 'STUBBED', 'PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "ecfStatus" "EcfStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN     "ecfStatusDetail" TEXT,
ADD COLUMN     "ecfSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "ecfTrackId" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "certificatePasswordEnc" TEXT;
