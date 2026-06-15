-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "proposedById" TEXT,
ADD COLUMN     "resolvedById" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "maxAdmins" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "maxLawyers" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'Profesional';
