-- AlterTable: tope ABSOLUTO de la familia de sesión (la rotación lo arrastra, no lo extiende).
-- Nullable por compatibilidad con refresh tokens existentes (legacy → caducan por "expiresAt").
ALTER TABLE "RefreshToken" ADD COLUMN "absoluteExpiresAt" TIMESTAMP(3);
