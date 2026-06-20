-- MFA (2FA TOTP) por usuario: secreto base32 cifrado, códigos de respaldo (hashes) y flag de activación.
-- Columnas nullable/boolean en tabla existente (User); heredan RLS y grants de la tabla.
ALTER TABLE "User" ADD COLUMN     "mfaBackupCodes" TEXT,
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT;
