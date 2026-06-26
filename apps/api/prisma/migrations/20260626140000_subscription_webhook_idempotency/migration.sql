-- Idempotencia del webhook de suscripción de la plataforma (M-2, auditoría 2026-06-26). Guarda el
-- `event.id` de Stripe; el primer INSERT gana y los reenvíos/replays del mismo evento firmado se
-- descartan. Global (no por tenant); lo escribe el cliente de sistema dentro del webhook, así que no
-- lleva RLS (ninguna ruta de tenant la toca).

CREATE TABLE "ProcessedStripeEvent" (
    "id"          TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);
