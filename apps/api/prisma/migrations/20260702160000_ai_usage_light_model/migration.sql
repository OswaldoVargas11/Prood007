-- Desglose del modelo LIGERO (AI_MODEL_LIGHT) dentro del uso diario de IA: permite medir el ahorro de
-- coste por tenant al enrutar tareas de baja complejidad (resúmenes cortos, verificador de citas) a un
-- modelo más barato que el principal (AI_MODEL). No cambia la cuota diaria (sigue siendo un único tope
-- por tenant+día); son columnas informativas adicionales sobre el subconjunto ligero.
ALTER TABLE "AiUsage" ADD COLUMN "lightModelInputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsage" ADD COLUMN "lightModelOutputTokens" INTEGER NOT NULL DEFAULT 0;
