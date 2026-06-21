-- Cancelación de suscripción AL FINAL DEL PERIODO (el admin la cancela desde la web).
-- La suscripción sigue ACTIVE y con acceso hasta `currentPeriodEnd`; entonces Stripe emite
-- `customer.subscription.deleted` y pasa a CANCELED. Este flag refleja la baja agendada para que la
-- UI muestre "se cancelará el …" y ofrezca reanudar. Default false: las filas existentes no cambian.
ALTER TABLE "Tenant" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
