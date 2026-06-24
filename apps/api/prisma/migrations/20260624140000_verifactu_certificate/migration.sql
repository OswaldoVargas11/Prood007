-- Certificado de firma Verifactu (ES) por despacho — FNMT/representante de persona jurídica. Separado del
-- certificado e-CF de la DGII para soportar despachos duales ES+DO. Columnas nullable → seguro sobre datos
-- existentes. Los GRANT a legalflow_app/legalflow_system los cubre el ALTER DEFAULT PRIVILEGES previo.
ALTER TABLE "Tenant" ADD COLUMN "verifactuCertName" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "verifactuCertKey" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "verifactuCertUploadedAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "verifactuCertPasswordEnc" TEXT;
