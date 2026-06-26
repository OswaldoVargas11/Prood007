# Programa de Mejora Continua de Lawzora

> Documento vivo del programa de mejora continua — generado 2026-06-27.

## 1. Objetivo y principio rector

Lawzora es un SaaS legal-tech vertical de gestión integral para despachos (practice management), multi-jurisdicción **España + República Dominicana** en un único producto, con cumplimiento fiscal de e-invoicing integrado (e-CF DGII en RD, Verifactu/TicketBAI en ES), módulo transaccional/M&A e IA cableada de extremo a extremo.

El programa de mejora continua existe para **incrementar el valor de adquisición de la IP**, no para alcanzar paridad funcional con incumbentes generalistas.

**Principio rector:** no perseguir paridad total con Clio o Aranzadi. El foso defendible de Lawzora es la combinación **ES + RD en un solo producto** con registro fiscal nativo de ambas jurisdicciones. La estrategia es **reforzar ese foso** y **cerrar únicamente los gaps baratos** que eleven el valor de adquisición —no construir features caras que un comprador estratégico ya tiene o puede replicar.

Cada inversión se mide contra una pregunta: _¿esto refuerza el diferencial ES+RD o cierra un gap barato de alto impacto en valoración?_ Si no, se aparca.

## 2. Mecanismos disponibles

La plataforma ya dispone de maquinaria de calidad y mejora automatizada que sostiene el ritmo del programa sin fricción manual.

| Mecanismo                          | Función                                                                                                                                                                                                 | Estado     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **CI gates**                       | Cobertura ≥90% (compliance + ficheros clave web), tests de integración RLS con Postgres real, drift de migraciones Prisma, audit/gitleaks/licencias. Checks requeridos: `CI OK` + `Fiscal Conformance`. | Activo     |
| **Conformance fiscal golden-file** | Jest puro determinista que congela la salida fiscal; cualquier deriva rompe el build.                                                                                                                   | Activo     |
| **Triage Claude (fiscal)**         | Workflow que, al fallar el golden-file, dispara un análisis automático con Claude para diagnosticar la regresión.                                                                                       | Activo     |
| **Improvement-scout semanal**      | Barrido semanal con Claude que propone mejoras priorizadas sobre el código real.                                                                                                                        | Activo     |
| **Semgrep + CodeQL**               | SAST continuo (CodeQL best-effort).                                                                                                                                                                     | Activo     |
| **Deep-research**                  | Harness de investigación multi-fuente con verificación adversarial para decisiones de producto/competencia.                                                                                             | Disponible |
| **Workflows multi-agente**         | Orquestación de varios agentes para tandas de PRs y auditorías (p.ej. revisores OWASP/CWE).                                                                                                             | Disponible |

## 3. Cadencia y gobernanza

- **Olas de trabajo:** el backlog se entrega en olas priorizadas (ver §4), no como flujo continuo sin foco.
- **Ramas desde main fresco:** cada rama parte de un `main` actualizado (`git fetch` antes de ramificar) para evitar PRs _behind_ y rebases innecesarios.
- **Definición de "hecho" = CI verde:** una tarea solo está completa cuando los checks requeridos (`CI OK` y `Fiscal Conformance`) están en verde en GitHub Actions real, no en local. CodeQL puede quedar _UNSTABLE_ sin bloquear.
- **Deploy a Fly manual:** el despliegue a producción (Fly.io, Frankfurt; Neon; R2; Brevo) es manual y deliberado, en foreground, separado del merge.
- **Gobernanza:** arquitectura y merges delegados al programa con verificación de los puntos clave de cada PR; branch protection con code-owner y checks requeridos.

## 4. Backlog priorizado por olas

### Ola 1 — EN IMPLEMENTACIÓN (rama `feat/continuous-improvement-program`)

| Iniciativa                  | Descripción                                                                                             | Por qué                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **OpenAPI/Swagger público** | Documentar y exponer la superficie REST (185 endpoints, 40 controladores) con especificación navegable. | Activa integraciones/partners; señal de madurez técnica en due-diligence. |
| **IA agéntica (tool-use)**  | Evolucionar el asistente de respuesta a **agente con tool-use** sobre los datos del despacho.           | Diferencial de producto barato sobre la IA ya cableada.                   |
| **Dossier**                 | Generación automática de dossier de expediente/operación.                                               | Cierra un gap de output visible con alto valor percibido.                 |

### Ola 2+

| Iniciativa                              | Esfuerzo   | Notas                                                                       |
| --------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| **Webhooks salientes**                  | Bajo       | Complementa OpenAPI; abre ecosistema de integraciones.                      |
| **App móvil vía Capacitor**             | Medio      | Reutiliza la web Next.js sin código nativo de cero.                         |
| **RAG jurídico sobre fuentes públicas** | Medio-alto | CENDOJ / BOE (ES) y Poder Judicial RD. Refuerza directamente el foso ES+RD. |
| **Onboarding por materia**              | Bajo-medio | Reduce time-to-value por área de práctica.                                  |
| **Marketplace**                         | —          | **Aplazado**: alto coste, bajo retorno en la fase actual.                   |

## 5. KPIs

El programa se mide contra indicadores que rastrean cierre de gaps y madurez, con el **ARR como palanca #1** de valoración.

| KPI                        | Definición                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **ARR (palanca #1)**       | Ingreso recurrente anual. Estado actual: esencialmente **pre-revenue**; convertir el foso en contratos es la prioridad de valor. |
| **Gaps cerrados**          | Número de gaps del §6 resueltos por ola.                                                                                         |
| **Cobertura de tests**     | Mantener los gates ≥90% sin regresión.                                                                                           |
| **Endpoints documentados** | Proporción de los 185 endpoints REST cubiertos por OpenAPI.                                                                      |
| **Conformance fiscal**     | Golden-file en verde de forma sostenida (cero derivas no intencionadas).                                                         |

## 6. Gaps → enfoque → esfuerzo → impacto en valoración

| Gap                                    | Enfoque                                                    | Esfuerzo   | Impacto en valoración                    |
| -------------------------------------- | ---------------------------------------------------------- | ---------- | ---------------------------------------- |
| API no documentada públicamente        | OpenAPI/Swagger sobre los 185 endpoints                    | Bajo       | Alto (integrabilidad + señal de madurez) |
| IA reactiva, no agéntica               | Tool-use sobre datos del despacho                          | Bajo-medio | Alto (diferencial barato)                |
| Sin output ejecutivo automatizado      | Generación de dossier                                      | Bajo       | Medio-alto (valor percibido)             |
| Sin notificaciones a sistemas externos | Webhooks salientes                                         | Bajo       | Medio (ecosistema)                       |
| Sin presencia móvil                    | App vía Capacitor (reutiliza web)                          | Medio      | Medio                                    |
| RAG limitado a datos del tenant        | RAG jurídico CENDOJ/BOE/PJ RD                              | Medio-alto | Alto (refuerza foso ES+RD)               |
| Fricción de adopción inicial           | Onboarding por materia                                     | Bajo-medio | Medio (time-to-value)                    |
| Transmisión fiscal diferida            | Activar e-CF DGII / Verifactu con cert real (acción owner) | —          | Alto (cumplimiento end-to-end)           |
| Marketplace inexistente                | Aplazado                                                   | Alto       | Bajo a corto plazo                       |

---

_El registro fiscal de ambas jurisdicciones se construye de forma nativa; la transmisión efectiva a AEAT/DGII está diferida a la entrega del certificado real por parte del owner. La suscripción SaaS ya cobra en Stripe LIVE y la plataforma está desplegada y pentestada (caja negra + white-box, jun-2026)._
