-- Hotfix de privilegios: 20260702090000_ecf_retry_attempts añadió "ecfAttempts" a "Invoice", pero desde
-- 20260624120000_fiscal_audit_immutability el rol de app solo tiene UPDATE sobre columnas enumeradas
-- (REVOKE UPDATE de tabla + GRANT por columna). Sin este GRANT, cualquier update del contador con el rol
-- de app (cron de reintento e-CF, EcfTransmissionService.updateEcfState) falla con "permission denied
-- for table Invoice" en prod. GRANT puramente aditivo: no toca las columnas fiscales inmutables.
GRANT UPDATE ("ecfAttempts") ON "Invoice" TO legalflow_app;
