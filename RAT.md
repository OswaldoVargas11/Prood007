# RAT — Registro de Actividades de Tratamiento

> Registro del artículo 30 RGPD (y equivalente bajo la **Ley 172-13** de RD). Estructura + contenido
> base; cada despacho (tenant) es **responsable del tratamiento** de los datos de sus clientes y
> expedientes. LegalFlow/Lexora actúa como **encargado del tratamiento** (proveedor del software).
> Ver D-022 (derechos del titular) y D-021 (cifrado/seguridad). Documento vivo: revisar al añadir
> tratamientos.

## 0. Roles

- **Responsable del tratamiento:** el despacho (tenant) sobre los datos de sus clientes/expedientes.
- **Encargado del tratamiento:** Lexora (procesa por cuenta del despacho; contrato de encargo / DPA
  pendiente de formalizar antes de datos reales).
- **DPO / contacto:** a designar por cada despacho (no provisto por el software).

## 1. Actividades de tratamiento

| #   | Actividad                            | Finalidad                              | Base jurídica                            | Categorías de interesados               | Categorías de datos                                                           |
| --- | ------------------------------------ | -------------------------------------- | ---------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Gestión de usuarios del despacho     | Autenticación, RBAC, control de acceso | Ejecución de contrato / interés legítimo | Personal del despacho (admin, letrados) | Identificación, credenciales (hash argon2), rol                               |
| 2   | Gestión de clientes                  | Alta y administración de la relación   | Ejecución de contrato                    | Clientes (personas físicas/jurídicas)   | Identificación, **identificador fiscal**, contacto (email/teléfono/dirección) |
| 3   | Gestión de expedientes               | Prestación del servicio jurídico       | Ejecución de contrato / obligación legal | Clientes y terceros del expediente      | Datos del asunto, posible **categoría especial** (según materia)              |
| 4   | Documentos                           | Custodia documental del expediente     | Ejecución de contrato / obligación legal | Clientes y terceros                     | Contenido documental (**cifrado en reposo**, D-021)                           |
| 5   | Facturación y cobros                 | Obligaciones fiscales y contables      | Obligación legal (fiscal)                | Clientes                                | Datos fiscales, importes, registro Verifactu/e-CF                             |
| 6   | Tareas y plazos procesales           | Cumplimiento de plazos                 | Ejecución de contrato / obligación legal | Personal y clientes                     | Fechas, asignaciones                                                          |
| 7   | Comunicaciones (chat/notificaciones) | Coordinación con el cliente            | Ejecución de contrato                    | Clientes y personal                     | Mensajes, metadatos                                                           |
| 8   | **Auditoría**                        | Trazabilidad y seguridad (append-only) | Obligación legal / interés legítimo      | Actores del sistema                     | Acción, actor, entidad, fecha, IP                                             |

## 2. Destinatarios y transferencias

- **Destinatarios:** solo el propio despacho (aislamiento estricto por tenant, RLS fail-closed, D-013/D-020).
- **Encargados ulteriores:** proveedor de hosting/almacenamiento (a definir; debe ofrecer DPA y residencia UE para ES).
- **Transferencias internacionales:** ninguna prevista por defecto. Si el hosting estuviera fuera del EEE
  para datos de ES, exigir garantías adecuadas (cláusulas tipo / adecuación). Ver §4.

## 3. Medidas de seguridad (resumen; detalle en DECISIONS/RUNBOOK)

- Aislamiento multi-tenant con **Postgres RLS fail-closed** (D-013/D-020).
- **Cifrado en reposo** del contenido de documentos (AES-256-GCM, D-021) + cifrado de disco de la BD
  (infra) para la PII estructurada. **TLS** en tránsito (RUNBOOK).
- Control de acceso **RBAC**; contraseñas con **argon2**; **AuditLog** inmutable (append-only).
- Derechos del titular: acceso/portabilidad (export) y supresión vía **anonimización** con retención
  legal por delante (D-022).

## 4. Conservación (retención) y residencia de datos

- **Principio:** la **conservación legal del expediente prevalece** sobre la supresión. El derecho de
  supresión RGPD/172-13 **cede** ante obligaciones legales de conservación (deber de custodia del
  expediente, obligaciones fiscales/contables).
- **Plazos de referencia** (ajustar por jurisdicción y tipo; el despacho confirma con su asesoría):
  - **Datos fiscales/facturación:** ES ~4–6 años (LGT/Código de Comercio); RD según normativa tributaria.
  - **Expediente / deber de custodia:** según normativa colegial y prescripción de responsabilidad.
  - **Auditoría:** se conserva (append-only); no se borra con la anonimización del cliente.
- **Retención configurable:** previsto como ajuste por tenant (plazo de retención por categoría) — se
  implementa con la migración de la Tarea 4 (PR aparte). Hasta entonces, política documentada aquí.
- **Residencia de datos:**
  - **España (`es`):** datos alojados en la **UE/EEE**. Hosting y backups en región UE.
  - **República Dominicana (`do`):** **a definir** (RD: Ley 172-13). Por defecto, alojar en una región
    acordada con el despacho; documentar la decisión por tenant antes de producción.
