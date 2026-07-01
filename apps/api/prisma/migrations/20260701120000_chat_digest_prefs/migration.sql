-- Resumen por correo de mensajes de chat sin leer (NEXT 1.1). Preferencia OPT-IN por usuario + marca
-- de dedupe/anti-spam. Columnas aditivas en una tabla ya protegida (User). NO toca dinero, fiscal ni
-- inmutabilidad; el canal de correo está además gateado por la feature global CHAT_DIGEST_ENABLED.

ALTER TABLE "User" ADD COLUMN "chatDigestEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastChatDigestAt" TIMESTAMP(3);
