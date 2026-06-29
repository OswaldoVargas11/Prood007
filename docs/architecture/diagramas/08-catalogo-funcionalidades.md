# 08 · Catálogo de funcionalidades

[⬅ Volver al índice](README.md)

Mapa de capacidades del producto. Cada rama corresponde a uno o varios módulos del API ([ver mapa](02-modulos-y-arquitectura.md)) y rutas de la web.

---

## 8.1 Mapa mental del producto

```mermaid
mindmap
  root(("Lawzora"))
    Identidad y acceso
      Login multi-despacho + MFA TOTP
      Social login Google/Microsoft
      RBAC FIRM_ADMIN · LAWYER · CLIENT
      Aceptación legal clickwrap
      Consola super-admin de plataforma
      KYC/AML por cliente
    Expedientes
      CRUD + estados + kanban
      Multi-letrado por expediente
      Captación de leads + conversión
      Carta de encargo
      Conflictos de interés
      Timeline de actividad
    Documentos
      Versionado + revisión
      Plantillas + cláusulas + lotes
      Carpetas en árbol con DnD
      Firma electrónica + firma en lote
      Import desde nube Drive/OneDrive
      Add-ins Word y Outlook
      Checklists de presentación
    Fiscal y cobro
      Facturación ES Verifactu + DO e-CF DGII
      Cálculo IVA/ITBIS/IRPF
      Libro mayor + aprobación de costes
      Provisiones anticipo/suplido
      Planes recurrentes + cuotas
      Pagos Stripe Connect + manual
      Dunning multicanal
      Suscripción SaaS + Fundador
    Transaccional
      Deal cockpit con working group e hitos
      Closing checklist + escrow
      Data room + QA + enlaces mágicos
      Disclosure schedules R-W
      Registros Mercantil/Propiedad/RD
      Secretaría corporativa actas/capital
    Comunicación
      Chat por expediente
      Chat interno staff DM + canales
      Notificaciones in-app
      Email entrante por BCC
      Snippets de email
    IA Zora
      Asistente agéntico tool-use
      Resumen del día + de documentos
      RAG citable
      Redacción de borradores con gate HITL
    Productividad y agenda
      Tareas + plazos procesales
      Time tracking
      Calendario + iCal
      Scheduling de citas
      Notificaciones judiciales LexNET-lite
      Digest semanal de tiempo no facturado
    Analítica
      Dashboard KPIs + gráficos
      Reportes cartera vencida · rentabilidad · fiscal
      Vistas guardadas
      Búsqueda global
    Portal del cliente
      Ver sus expedientes
      Subir documentos
      Reservar citas
      Justificantes de suplido
    Plataforma
      Multi-tenant + RLS
      Realtime Socket.IO + Redis
      Webhooks salientes
      Auditoría append-only
      PWA + dictado
      Observabilidad Sentry + pino
```

---

## 8.2 Madurez por área

| Área                                     | Estado         | Notas                                                                |
| ---------------------------------------- | -------------- | -------------------------------------------------------------------- |
| Expedientes / documentos / tareas        | ✅ Producción  | Núcleo maduro                                                        |
| Facturación ES/DO (cálculo + encadenado) | ✅ Producción  | Conformidad fiscal con golden-files                                  |
| Transmisión fiscal (AEAT / DGII)         | 🟡 Gated       | Motor end-to-end listo; falta **certificado real** del owner         |
| Cobro online                             | 🟡 Parcial     | Stripe Connect ES; RD en stub (manual)                               |
| IA agéntica                              | 🟡 Gated       | Listo; activar con `ANTHROPIC_API_KEY` (+ `VOYAGE_API_KEY` para RAG) |
| Firma electrónica                        | 🟡 Stub        | Signaturit con webhook HMAC; integración real pendiente              |
| Transaccional (deal/data room/closing)   | ✅ Producción  | Sembrar más escenarios demo                                          |
| Mensajería / realtime                    | ✅ Producción  | Multi-instancia requiere `REDIS_URL`                                 |
| Integraciones nube (Google/MS)           | ✅ Desplegado  | Usuarios reconectan en Ajustes                                       |
| Notificaciones judiciales                | 🟡 LexNET-lite | Acreditación LexNET pendiente (owner)                                |

Leyenda: ✅ en producción · 🟡 implementado pero requiere acción de owner / config para activar plenamente.
