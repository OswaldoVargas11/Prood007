-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvoiceStatus" ADD VALUE 'PARTIAL';
ALTER TYPE "InvoiceStatus" ADD VALUE 'OVERDUE';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_dueDate_idx" ON "Invoice"("tenantId", "dueDate");
