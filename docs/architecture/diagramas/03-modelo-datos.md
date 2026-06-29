# 03 · Modelo de datos (ERD por dominios)

[⬅ Volver al índice](README.md)

Los **82 modelos** Prisma agrupados por dominio. Casi todas las tablas llevan `tenantId` (eje de multitenancy). Se muestran solo los campos y relaciones relevantes.

**Entidades-eje:** `Tenant` (raíz multitenant) · `Matter` (expediente) · `Client` · `User` · `Invoice` (núcleo fiscal).

---

## 3.1 Identidad, tenant y RBAC

```mermaid
erDiagram
  Tenant ||--o{ User : "empleados"
  Tenant ||--o{ Role : "roles"
  Tenant ||--o{ Client : "clientes"
  Tenant ||--o{ Matter : "expedientes"
  User ||--o{ UserRole : ""
  Role ||--o{ UserRole : ""
  Role ||--o{ RolePermission : ""
  Permission ||--o{ RolePermission : ""
  User ||--o{ RefreshToken : "sesiones"
  User ||--o{ PasswordReset : ""
  Tenant ||--o{ LegalAcceptance : "consentimientos"
  User ||--o{ LegalAcceptance : "firma"
  LegalDocument ||--o{ LegalAcceptance : "versión aceptada"

  Tenant {
    string id PK
    string name
    enum jurisdiction "es | do"
    enum accountType "FIRM | PROFESSIONAL | CONSUMER"
    enum subscriptionStatus
    string plan
    int seats
    bool isFounder
    string stripeCustomerId
    string intakeToken UK
  }
  User {
    string id PK
    string tenantId FK
    string email
    string passwordHash
    bool mfaEnabled
    decimal billRate
  }
  LegalDocument {
    string id PK
    enum type "TERMS|PRIVACY|DPA|SUBPROCESSORS|..."
    string version
    string bodyHash "SHA256"
    bool isCurrent
  }
  LegalAcceptance {
    string id PK
    enum method "CLICKWRAP|TYPED|UPLOADED"
    string documentHash "prueba"
    string ipAddress
    datetime acceptedAt
  }
```

> `LegalAcceptance` y `AuditLog` son **append-only**. `LegalDocument`, `Permission` y `ProcessedStripeEvent` son **globales** (no tenant-scoped).

---

## 3.2 Expedientes, clientes, tareas y tiempo

```mermaid
erDiagram
  Client ||--o{ Matter : "tiene"
  Client ||--|| KycProfile : "AML 1:1"
  Tenant ||--o{ Lead : "captación"
  Lead ||..o| Client : "conversión"
  Matter ||--o{ MatterAssignment : "letrados extra"
  Matter ||--o{ Task : "tareas"
  Matter ||--o{ TimeEntry : "tiempo"
  Matter ||--o{ MatterEmail : "correos"
  Matter ||--o{ JudicialNotification : "notificaciones"
  Matter ||--o{ MatterChecklist : "checklists"
  PresentationType ||--o{ PresentationRequirement : ""
  PresentationType ||--o{ PresentationTaskTemplate : ""
  PresentationType ||--o{ MatterChecklist : "instancia"

  Matter {
    string id PK
    string tenantId FK
    string reference UK
    string title
    enum type
    enum status "OPEN|IN_PROGRESS|CLOSED|..."
    string clientId FK
    string lawyerId FK
    string court
    string caseNumber
  }
  Task {
    string id PK
    string matterId FK
    enum status "TODO|IN_PROGRESS|DONE"
    datetime dueDate
    bool isProcedural "plazo procesal"
    string assigneeId
  }
  TimeEntry {
    string id PK
    string matterId FK
    int minutes
    decimal hourlyRate
    bool billed
  }
  JudicialNotification {
    string id PK
    enum source "LEXNET|IMPORT|MANUAL"
    string court
    string taskId "genera plazo"
  }
```

---

## 3.3 Documentos, carpetas, plantillas y firma

```mermaid
erDiagram
  Tenant ||--o{ Folder : ""
  Folder ||--o{ Folder : "anidación"
  Matter ||--o{ Document : ""
  Folder ||--o{ Document : ""
  Document ||--o{ DocumentVersion : "versiones"
  DocumentVersion ||--o{ DocumentReview : "revisiones"
  DocumentVersion ||--o{ SignatureRequest : "firma"
  Tenant ||--o{ DocumentTemplate : ""
  Tenant ||--o{ DocumentPackage : "lotes"
  Tenant ||--o{ Clause : "cláusulas"
  Tenant ||--o{ EmailSnippet : ""

  Document {
    string id PK
    string tenantId FK
    string matterId FK
    string folderId FK
    string name
  }
  DocumentVersion {
    string id PK
    int version
    string storageKey "R2 cifrado"
    string contentHash
    enum reviewStatus
    string uploadedById FK
  }
  SignatureRequest {
    string id PK
    string provider "Signaturit"
    string externalId
    enum status
    string signerEmail
  }
  Folder {
    string id PK
    enum kind "DOCUMENT|TEMPLATE"
    string matterId
    string parentId FK
  }
```

---

## 3.4 Fiscal, facturación, cobro y provisiones

```mermaid
erDiagram
  Matter ||--o{ Invoice : ""
  Client ||--o{ Invoice : ""
  Invoice ||--o{ InvoiceLine : "líneas"
  Invoice ||--o{ LedgerEntry : "asientos"
  Invoice ||--o{ Payment : "pagos"
  Invoice ||--o{ DunningReminder : "avisos"
  Invoice ||--o{ FiscalEvent : "encadenado"
  Invoice ||--o| Invoice : "rectifica"
  Matter ||--o{ LedgerEntry : ""
  Matter ||--|| RetainerAccount : "provisión 1:1"
  RetainerAccount ||--o{ RetainerEntry : ""
  Matter ||--o{ BillingSchedule : "planes"
  BillingSchedule ||--o{ BillingInstallment : "cuotas"
  Payment ||--o{ BillingInstallment : ""
  Tenant ||--o{ DunningRule : "reglas"
  DunningRule ||--o{ DunningReminder : ""

  Invoice {
    string id PK
    string number UK
    enum status "DRAFT|ISSUED|PAID|OVERDUE..."
    enum invoiceFormat "ES | DO"
    decimal taxableBase
    decimal taxAmount
    decimal withholdingAmount
    decimal total
    json complianceRecord "opaco"
    enum ecfStatus "RD e-CF"
    string ecfTrackId
    enum documentType "NORMAL|RECTIFICATIVA"
  }
  FiscalEvent {
    string id PK
    string recordHash
    string previousEventHash "cadena"
    json payload "snapshot inmutable"
  }
  LedgerEntry {
    string id PK
    enum type "PROVISION|DISBURSEMENT|TIME_FEE|INVOICE|PAYMENT"
    decimal amount
    enum approvalStatus
  }
  RetainerEntry {
    string id PK
    enum type "DEPOSIT|APPLICATION|REFUND"
    enum kind "ANTICIPO|SUPLIDO|GENERICO"
    decimal amount
  }
```

> `FiscalEvent` y `LedgerEntry` son **append-only**; la integridad fiscal se garantiza por **encadenado de hash** (`recordHash`/`previousEventHash`) y privilegios de columna en `Invoice`. `InvoiceSequence` y `EcfSequence` gestionan numeración y rangos eNCF autorizados (RD).

---

## 3.5 Transaccional: closing, data room y secretaría corporativa

```mermaid
erDiagram
  Matter ||--o{ ClosingChecklist : ""
  ClosingChecklist ||--o{ ClosingChecklistItem : "items"
  Matter ||--o{ DealParty : "working group"
  Matter ||--o{ DealMilestone : "hitos"
  Matter ||--o{ DisclosureSchedule : "reps y warranties"
  Matter ||--o{ RegistryFiling : "registros"
  Matter ||--|| EngagementLetter : "encargo 1:1"
  Matter ||--o{ DataRoom : ""
  DataRoom ||--o{ DataRoomFolder : ""
  DataRoom ||--o{ DataRoomDocument : ""
  DataRoom ||--o{ DataRoomGroup : "permisos"
  DataRoom ||--o{ DataRoomGrant : "enlaces mágicos"
  DataRoom ||--o{ DataRoomQuestion : "QA"
  DataRoom ||--o{ DataRoomAccessLog : "auditoría"
  Client ||--o{ CorporateMinute : "actas"
  Client ||--o{ Shareholder : "capital"
  Client ||--o{ ShareTransfer : "transmisiones"
  Client ||--o{ RegistryObligation : "obligaciones"

  ClosingChecklistItem {
    string id PK
    enum category "CONDITION_PRECEDENT|DELIVERABLE|SIGNATURE_PAGE"
    enum phase "AT_SIGNING|AT_CLOSING|POST_CLOSING"
    enum status "PENDING|WAIVED|SATISFIED"
    bool inEscrow
  }
  DataRoomGrant {
    string id PK
    string tokenHash UK
    string email
    enum role "VIEWER|CONTRIBUTOR"
    json folderIds
  }
  DealMilestone {
    string id PK
    enum kind "SIGNING|CLOSING|LONGSTOP|..."
    datetime targetDate
    enum status "PENDING|DONE|MISSED"
  }
```

---

## 3.6 Comunicación, IA, integraciones y auditoría

```mermaid
erDiagram
  Matter ||--o{ Message : "chat expediente"
  Tenant ||--o{ Conversation : "chat interno"
  Conversation ||--o{ ConversationMember : ""
  Conversation ||--o{ ChatMessage : ""
  Tenant ||--o{ AiConversation : "chat Zora"
  AiConversation ||--o{ AiChatMessage : ""
  Tenant ||--o{ AiEmbedding : "índice RAG"
  Tenant ||--o{ AiUsage : "cuota diaria"
  Tenant ||--o{ Notification : ""
  Tenant ||--o{ AuditLog : "append-only"
  Tenant ||--o{ WebhookEndpoint : "salientes"
  Tenant ||--o{ OAuthConnection : "Google/MS"
  Tenant ||--o{ SubprocessorSubscription : ""
  Tenant ||--o{ SavedView : ""
  User ||--o{ Appointment : "agenda"
  User ||--|| SchedulingConfig : "disponibilidad"

  AiChatMessage {
    string id PK
    enum role "user|assistant"
    string content
    json meta "estado UI"
  }
  AiEmbedding {
    string id PK
    enum kind "matter|document"
    float[] embedding "coseno, sin pgvector"
    string model
  }
  AuditLog {
    string id PK
    string actorId
    string action
    string entityType
    json metadata
    datetime createdAt
  }
  OAuthConnection {
    string id PK
    string provider "google|microsoft"
    string accessToken "AES-256-GCM"
    string refreshToken "cifrado"
  }
```

---

## 3.7 Dominios → modelos (índice rápido)

| #   | Dominio                     | Modelos                                                                                                                                             |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Identidad / Tenant / RBAC   | Tenant, User, Role, Permission, UserRole, RolePermission, RefreshToken, PasswordReset                                                               |
| 2   | Clientes / Contactos        | Client, KycProfile, Lead                                                                                                                            |
| 3   | Expedientes                 | Matter, MatterAssignment, MatterReadState, MatterEmail, MatterChecklist                                                                             |
| 4   | Documentos / Almacenamiento | Document, DocumentVersion, DocumentReview, DocumentTemplate, DocumentPackage, Folder, SignatureRequest, EmailSnippet                                |
| 5   | Fiscal / Facturación        | Invoice, InvoiceLine, InvoiceSequence, LedgerEntry, FiscalEvent, EcfSequence                                                                        |
| 6   | Cobro / Suscripción         | Payment, BillingSchedule, BillingInstallment, RetainerAccount, RetainerEntry, DunningRule, DunningReminder, ProcessedStripeEvent, SavedView, Clause |
| 7   | Tareas / Tiempo             | Task, TimeEntry, JudicialNotification                                                                                                               |
| 8   | Transaccional / Deal        | ClosingChecklist, ClosingChecklistItem, DealParty, DealMilestone, DisclosureSchedule, RegistryFiling, DataRoom (+6 submodelos)                      |
| 9   | Secretaría corporativa      | EngagementLetter, CorporateMinute, Shareholder, ShareTransfer, RegistryObligation                                                                   |
| 10  | Agenda                      | SchedulingConfig, Appointment                                                                                                                       |
| 11  | Cumplimiento legal          | LegalDocument, LegalAcceptance                                                                                                                      |
| 12  | Mensajería                  | Message, Conversation, ConversationMember, ChatMessage, AiConversation, AiChatMessage                                                               |
| 13  | IA / Embeddings             | AiEmbedding, AiUsage                                                                                                                                |
| 14  | Auditoría / Plataforma      | AuditLog, Notification, WebhookEndpoint, SubprocessorSubscription                                                                                   |
| 15  | Integraciones               | OAuthConnection                                                                                                                                     |
| 16  | Checklists de presentación  | PresentationType, PresentationRequirement, PresentationTaskTemplate                                                                                 |
