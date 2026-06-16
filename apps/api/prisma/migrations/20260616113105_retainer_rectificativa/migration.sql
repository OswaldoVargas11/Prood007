-- CreateEnum
CREATE TYPE "InvoiceDocumentType" AS ENUM ('NORMAL', 'RECTIFICATIVA');

-- CreateEnum
CREATE TYPE "RectificationMode" AS ENUM ('SUSTITUCION', 'DIFERENCIAS');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "documentType" "InvoiceDocumentType" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "rectificationMode" "RectificationMode",
ADD COLUMN     "rectificationReason" TEXT,
ADD COLUMN     "rectifiesInvoiceId" TEXT,
ADD COLUMN     "withholdingTaxCode" TEXT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_rectifiesInvoiceId_fkey" FOREIGN KEY ("rectifiesInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
