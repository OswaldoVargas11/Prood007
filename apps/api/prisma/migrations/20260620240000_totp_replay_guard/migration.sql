-- Anti-replay de TOTP: guarda el último contador de ventana TOTP aceptado por usuario, para rechazar
-- la reutilización de un código todavía válido dentro de su ventana. Nullable (solo aplica con MFA).
ALTER TABLE "User" ADD COLUMN "lastTotpCounter" INTEGER;
