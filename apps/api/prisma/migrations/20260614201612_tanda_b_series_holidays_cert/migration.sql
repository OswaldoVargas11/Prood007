-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "certificateKey" TEXT,
ADD COLUMN     "certificateName" TEXT,
ADD COLUMN     "certificateUploadedAt" TIMESTAMP(3),
ADD COLUMN     "holidays" JSONB,
ADD COLUMN     "invoiceSeries" TEXT NOT NULL DEFAULT 'FAC';
