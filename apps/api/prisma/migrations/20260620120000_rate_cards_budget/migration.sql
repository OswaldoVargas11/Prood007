-- Rate card del letrado (tarifa de facturación + coste/hora) y presupuesto del expediente.
-- Columnas nullable en tablas existentes (User, Matter); heredan RLS y grants de su tabla.
ALTER TABLE "User" ADD COLUMN     "billRate" DECIMAL(18,2),
ADD COLUMN     "costRate" DECIMAL(18,2);

ALTER TABLE "Matter" ADD COLUMN     "budgetAmount" DECIMAL(18,2);
