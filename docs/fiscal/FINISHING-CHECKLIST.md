# Checklist para terminar la facturación fiscal (e-CF RD · Verifactu ES)

Estado: la **estructura está completa y desplegable**. Lo que queda depende de obtener los **certificados
reales** y de validar contra los **bancos de pruebas oficiales** (DGII CerteCF / AEAT). Este documento
enumera el ÚNICO punto a rellenar en cada caso y dónde vive el _seam_.

> Regla: nada aquí debe inventarse "a ciegas". Cada firma se cierra ejecutando el set de pruebas oficial
> con el certificado real; el código deja el enganche aislado para que el cambio sea localizado.

---

## 🇩🇴 e-CF (DGII, RD)

Ya implementado y desplegable:

- ✅ Custodia del `.p12` por despacho (`dgii-credential.service.ts`, `POST /dgii/certificate`, FIRM_ADMIN).
- ✅ **Numeración eNCF desde rango autorizado** por tipo (`EcfSequence`, `GET/POST /dgii/ecf-sequences`).
- ✅ Motor de transmisión semilla→token→recepción→estado, gated por `DGII_ENV` (`ecf-transmission.service.ts`).
- ✅ Firma **XAdES-BES** envuelta (`dgii-signer.ts`): XML-DSig + propiedades cualificadas (`SigningTime`,
  `SigningCertificate`) y `<Reference>` a `SignedProperties`, FIRMADA y verificable (`dgii-signer.spec.ts`).
- ✅ **Huella sobre el XML firmado** — con el firmador inyectado, el provider dominicano persiste el e-CF
  FIRMADO y calcula `recordHash` sobre el XML ya firmado (`dominican.provider.ts`, seam `ecfSigner`).

**Pendiente (rellenar en certificación CerteCF con el cert real):**

1. **Perfil XAdES exacto** — ratificar contra el set de pruebas de CerteCF el perfil que pide la DGII
   (`SigningCertificateV2`, política de firma, forma RFC2253 del `IssuerName`). El núcleo XAdES-BES y el
   seam ya están cerrados; solo se afina el cuerpo de `signEnvelopedXml()` con el certificado real.
2. **Cableado del firmador en la emisión** — pasar `ecfSigner` (firma con el `.p12` del despacho) al
   construir el e-CF, gated por la presencia del certificado. Depende del cert real.
3. **Activar transmisión** — `DGII_ENV=cert` (set de pruebas) → iterar hasta aprobar → `DGII_ENV=prod`.

Owner: RNC activo + `.p12` de una CA acreditada por INDOTEL + rangos eNCF aprobados en la Oficina Virtual.

---

## 🇪🇸 Verifactu (AEAT, ES)

Ya implementado y desplegable:

- ✅ Huella encadenada Verifactu (`SHA256(...|previousRecordHash)`), génesis `0…0`, registro de eventos
  inmutable (`FiscalEvent`) e inalterabilidad en BD.
- ✅ **Custodia del certificado de firma ES por despacho** (`verifactu-credential.service.ts`,
  `POST /verifactu/certificate`, FIRM_ADMIN) — FNMT/representante, SEPARADO del `.p12` de DGII.
- ✅ **Firma del registro EN LA EMISIÓN** (LAW-82 cerrado) — `emitInvoiceInTx` genera el XML del
  `RegistroAlta` AEAT (`registro-xml.ts`) y lo firma XAdES-BES vía `VerifactuRegistroService` +
  `VerifactuSignerService` cuando el despacho tiene certificado; sin certificado, el registro queda
  encadenado SIN firma (comportamiento previo intacto, con aviso en Ajustes). El XML, la huella AEAT y el
  firmante se persisten en el INSERT (`Invoice.verifactuXml/verifactuHuella/verifactuSignedBy`,
  inalterables para el rol de app).
- ✅ **Huella AEAT propia** — `computeHuellaAeat` implementa el algoritmo oficial (Orden HAC/1177/2024:
  `campo=valor&…` + SHA-256 hex mayúsculas), encadenada SOLO entre registros Verifactu. La cadena interna
  (`recordHash`) NO cambia de formato: las facturas ya emitidas en prod siguen verificando.
- ✅ **Remisión VERI\*FACTU** — `VerifactuSubmissionService` + `VerifactuClient` (SOAP `SistemaFacturacion`
  con TLS mutuo, análogo a `ecf-transmission`), gated por `VERIFACTU_ENV` (test = banco de pruebas
  `prewww1.aeat.es` · prod). Acuse (EstadoRegistro + CSV) persistido en la factura y en `FiscalEvent`
  (append-only). Inline tras emitir + **cron de reintento idempotente** cada 10 min (`verifactu.cron.ts`,
  solo PENDING, tope de intentos, duplicados reconciliados como aceptados).
- ✅ **QR parametrizable** — el host base del QR se inyecta (`SpainComplianceProvider(qrBaseUrl)` +
  `VERIFACTU_QR_HOST`); default preproducción (no rompe los golden), producción sin tocar código.

**Pendiente (rellenar en certificación con el cert real — nada de esto se simula):**

1. **Acceso al banco de pruebas** (owner) — certificado de representante dado de alta en el entorno de
   pruebas de la AEAT. Activar con `VERIFACTU_ENV=test` y el `.p12` del despacho subido en Ajustes; sin
   `VERIFACTU_ENV` NADA se transmite.
2. **Ratificar contra el set de pruebas** (con el banco ya accesible):
   - forma exacta de `FechaHoraHusoGenRegistro` (hoy UTC `+00:00`) y del cálculo de huella;
   - `ImporteTotal` con retención IRPF (criterio aplicado: la retención NO se resta del registro AEAT);
   - código de error de registro duplicado (hoy `3000`) y `TipoUsoPosible*` del bloque SistemaInformatico;
   - clientes extranjeros (hoy `IDDestinatario/NIF`; pasaportes requerirán `IDOtro`);
   - perfil XAdES exacto (política de firma, `SigningCertificateV2`) — la firma no es exigible en
     modalidad VERI\*FACTU, pero se emite firmado cuando hay certificado.
3. **`VERIFACTU_SIF_NIF`** (owner) — NIF del productor del software para el bloque `SistemaInformatico` +
   **declaración responsable** del SIF ante la AEAT (trámite, no código).
4. **Host de producción del QR** — fijar `VERIFACTU_QR_HOST` al host ratificado (`AEAT_QR_HOST_PROD` es el
   candidato; confirmar antes de producción).
5. **Histórico STUBBED** — las facturas emitidas ANTES de activar `VERIFACTU_ENV` quedan STUBBED y no se
   re-remiten automáticamente (la obligación empieza al operar como VERI\*FACTU); decidir en activación si
   se remite algún tramo manualmente.

Owner: certificado FNMT/representante de persona jurídica (sede.fnmt.gob.es o QTSP) + alta en el banco de
pruebas AEAT + `VERIFACTU_SIF_NIF`.

---

## Resumen de "lo que solo tú puedes aportar"

| Necesito                            | De dónde                                     | Desbloquea          |
| ----------------------------------- | -------------------------------------------- | ------------------- |
| `.p12` DGII (RD) + rangos eNCF      | CA acreditada INDOTEL + DGII Oficina Virtual | e-CF (1)(2)(3)      |
| Certificado FNMT/representante (ES) | FNMT o QTSP                                  | Verifactu (1)(2)(3) |
| Acceso a bancos de prueba           | DGII CerteCF / AEAT                          | Certificar ambos    |

Cobro online RD (Azul): aparcado por decisión del owner; ver la recomendación en el historial (afiliación
Azul + sandbox de `dev.azul.com.do`). El `PaymentProvider` ya selecciona por jurisdicción (stub RD activo).
