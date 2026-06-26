# Valoración y Dossier de Venta

> Documento vivo del programa de mejora continua — generado 2026-06-27.

Este documento sintetiza una valoración defendible de **Lawzora** (antes "LegalFlow"), un SaaS legal-tech vertical de gestión integral para despachos (practice management), multi-jurisdicción **España + República Dominicana**, con cumplimiento fiscal de e-invoicing (e-CF DGII / Verifactu-TicketBAI), módulo transaccional/M&A e IA integrada. Está concebido como material para due-diligence y venta de IP.

## 1. Tesis de valoración

El punto central, y el más fácil de malinterpretar, es este:

> **Un SaaS pre-revenue NO se valora por múltiplos de ARR.** Con ARR ≈ 0, la métrica EV/ARR queda indefinida (división por cero). Los múltiplos de 12x–19x que se ven en las operaciones recientes pertenecen a empresas con **decenas o cientos de millones de euros de ARR** y no son aplicables a un activo sin ingresos recurrentes significativos.

En estado pre-revenue, el valor se rige por tres palancas distintas:

1. **Coste de reconstrucción** — qué costaría a un comprador edificar lo equivalente (185 endpoints REST, RLS multi-tenant, motor fiscal, transaccional, IA, CI estricto con cobertura ≥90% y conformance fiscal golden-file).
2. **Acqui-hire** — valor del equipo y del conocimiento de dominio embebido (patrón Libra, abajo).
3. **Prima estratégica por el foso regulatorio** — el _time-to-market_ que se ahorra un comprador que necesita cumplimiento fiscal certificado en España y RD. Esta prima es **cualitativa y no cuantificada por ninguna fuente**; es una inferencia razonada, no un dato.

## 2. Comparables verificados

Operaciones y benchmarks confirmados mediante investigación con verificación adversarial:

| #   | Operación / Fuente                                                                 | Importe                                    | Múltiplo                                             | Fecha    | Nota                                          |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------- | -------- | --------------------------------------------- |
| a   | Wolters Kluwer compra **Brightflag**                                               | 425M EUR                                   | ~15.7x ARR (27M EUR ARR) / 19.3x ingresos            | may-2025 | Empresa con ARR maduro                        |
| b   | Clio compra **vLex**; entidad valorada en 5.000M USD                               | 1.000M USD (adq.)                          | ~12.5x ARR (400M USD ARR)                            | nov-2025 | Múltiplo sobre ARR de escala                  |
| c   | WK compra **Libra** (IA legal, fundada 2023, ~15 empleados, ~5M EUR ARR previstos) | hasta 90M EUR (30M upfront + 60M earn-out) | ~18x forward ARR headline / ~6x sobre el upfront     | nov-2025 | Fuerte componente **acqui-hire**              |
| d   | **SaaS B2B privado** (SaaS Capital)                                                | —                                          | ~4.8x ingresos (bootstrapped) / 5.3x (equity-backed) | ene-2025 | Múltiplo impulsado por **crecimiento**        |
| e   | WK compra **Level Programs/Kmaleon** (practice-management español)                 | **no divulgado** ("impacto inmaterial")    | n/d                                                  | jun-2022 | Prueba de **apetito estratégico** en el nicho |

**Lectura del set:**

- Los comparables (a) y (b) fijan el techo teórico del régimen de múltiplos, pero solo aplican con ARR real y a escala.
- El comparable (c), **Libra**, es el más análogo a Lawzora en estado actual: empresa muy joven, equipo pequeño, ARR mínimo/forward, valorada principalmente por talento + producto temprano vía **earn-out**. El headline de 18x forward ARR es engañoso: sobre el _upfront_ es ~6x, y la mayoría del valor es contingente.
- El comparable (d) ancla la "gravedad" de mercado para un SaaS privado sano: **4.8x–5.3x ingresos**, fuertemente condicionado al crecimiento.
- El comparable (e) demuestra que el comprador estratégico natural (Wolters Kluwer) **ya ha comprado practice-management español** — existe apetito, aunque el precio no sirva de ancla por no divulgarse.

## 3. Rangos de valoración para Lawzora

| Escenario                                           | Rango                                                                | Vehículo                      | Driver dominante                             |
| --------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------- | -------------------------------------------- |
| **Estado actual (pre-revenue)**                     | 150k – 600k EUR                                                      | Venta de activos (asset sale) | Coste de reconstrucción + IP                 |
| **Comprador estratégico + foso fiscal certificado** | 600k – 2.5M EUR                                                      | Earn-out estilo Libra         | Acqui-hire + prima de _time-to-market_       |
| **Con ARR real**                                    | Régimen de múltiplos: **4–6x base**, hasta **8–15x con estratégico** | M&A clásico                   | ARR + crecimiento + compliance en producción |

**El salto a millones no es más código.** El producto ya es técnicamente maduro (CI con gates de cobertura ≥90%, conformance fiscal determinista, pentest caja negra + white-box). Lo que mueve la valoración del primer al segundo y tercer escenario es:

1. **ARR real** — una base de clientes de pago que convierta el activo en negocio.
2. **Compliance certificado en producción** — transmisión fiscal viva a AEAT/DGII (hoy el registro fiscal se _construye_ pero la transmisión está diferida a falta del certificado real del owner). El foso solo vale como prima si está **demostrado**, no solo cableado.

## 4. Caveats (lectura honesta para due-diligence)

- **Los múltiplos altos no son nuestros.** 12x–19x ARR corresponden a empresas con decenas/cientos de millones de ARR (Brightflag, vLex). Aplicarlos a Lawzora sería un error de categoría.
- **La prima por el foso regulatorio no está cuantificada por ninguna fuente.** Es una inferencia **cualitativa** basada en el coste y el plazo de homologar e-CF/Verifactu, no un múltiplo observado en una transacción.
- **El headline de Libra (18x forward ARR) es marketing de operación.** El valor real entregado de inicio es ~6x sobre el upfront, con el grueso contingente al earn-out. Cualquier earn-out propuesto para Lawzora debe leerse igual: _cap_ alto, certeza baja.
- **Pre-revenue penaliza la liquidez.** Sin tracción comercial, el universo de compradores se reduce a estratégicos del nicho (p. ej. WK) o a operadores que buscan acelerar entrada a ES/RD.

## 5. Claves de venta — qué pulir antes de vender

Acciones concretas para maximizar el valor defendible y reducir los descuentos de due-diligence:

- [ ] **Rotar todos los secretos** de producción (Stripe live, JWT de plataforma, claves de proveedores). Es el primer punto que mirará cualquier comprador técnico.
- [ ] **Limpiar el secreto en el historial de git** (contraseña de prueba pusheada en commit antiguo): rotar la cuenta afectada y, opcionalmente, purgar el historial.
- [ ] **Cert DGII real + transmisión fiscal viva** — pasar de "registro fiscal construido" a "transmisión e-CF/Verifactu certificada en producción". Esto convierte el foso de _cualitativo_ a _demostrable_ y habilita la prima estratégica.
- [ ] **Dossier del moat** — empaquetar la evidencia del foso: cobertura de cumplimiento ES+RD, conformance fiscal golden-file, RLS multi-tenant, pentests, arquitectura. Es lo que justifica el salto del rango bajo al medio.
- [ ] **Primeros clientes de pago** — incluso una base pequeña de ARR real cambia el régimen de valoración (de asset sale a múltiplos) y es la palanca de mayor impacto.

---

_Material confidencial para due-diligence / venta de IP. Las cifras de comparables proceden de operaciones públicas verificadas; los rangos para Lawzora son estimaciones razonadas, no tasaciones formales._
