-- Id del DOCUMENTO dentro del sobre de Signaturit. Los webhooks reales del proveedor solo traen
-- `document.id` (no el id del sobre ni tenant), así que la correlación evento→fila local se hace por
-- esta columna. Aditiva y nullable: el histórico (stub) queda NULL y solo casa por externalId legado.
ALTER TABLE "SignatureRequest" ADD COLUMN "providerDocumentId" TEXT;

CREATE INDEX "SignatureRequest_providerDocumentId_idx" ON "SignatureRequest"("providerDocumentId");
