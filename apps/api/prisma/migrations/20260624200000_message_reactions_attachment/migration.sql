-- Chat tipo red social: reacciones (mapa emoji→userIds) y documento del expediente adjunto al mensaje.
-- Columnas nullable sobre Message (que ya tiene RLS); sin cambios de política.

ALTER TABLE "Message" ADD COLUMN "reactions" JSONB;
ALTER TABLE "Message" ADD COLUMN "attachmentDocumentId" TEXT;
