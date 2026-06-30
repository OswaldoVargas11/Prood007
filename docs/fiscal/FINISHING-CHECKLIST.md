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
- ✅ **Firma del registro** — `VerifactuSignerService` firma el registro Verifactu (XAdES-BES) consumiendo
  `VerifactuCredentialService.loadCert(tenantId)`; gated (devuelve `null` sin certificado). Verificable
  (`verifactu-signer.service.spec.ts`).
- ✅ **QR parametrizable** — el host base del QR se inyecta (`SpainComplianceProvider(qrBaseUrl)` +
  `VERIFACTU_QR_HOST`); default preproducción (no rompe los golden), producción sin tocar código.

**Pendiente (rellenar en certificación con el cert real):**

1. **Perfil XAdES AEAT** — ratificar el perfil exacto (política de firma, `SigningCertificateV2`) contra el
   banco de pruebas de la AEAT. El seam de firma ya está cerrado; solo se afina el cuerpo.
2. **Host de producción del QR** — fijar `VERIFACTU_QR_HOST` al host de producción ratificado en el manual
   de la AEAT (`AEAT_QR_HOST_PROD` es el candidato; confirmar antes de producción).
3. **Modalidad de remisión:**
   - **No-VERI\*FACTU** (firma + conserva + QR): hito mínimo válido para vender en ES. Solo requiere (1)+(2).
   - **VERI\*FACTU** (remisión automática a la AEAT): nuevo `VerifactuSubmissionService` con el servicio web
     SOAP de la AEAT (`SistemaFacturacion`), reintentos y consulta de estado. Análogo a `ecf-transmission`.
4. **Declaración responsable** del software (fabricante del SIF) ante la AEAT — trámite, no código.

Owner: certificado FNMT/representante de persona jurídica (sede.fnmt.gob.es o QTSP).

---

## Resumen de "lo que solo tú puedes aportar"

| Necesito                            | De dónde                                     | Desbloquea          |
| ----------------------------------- | -------------------------------------------- | ------------------- |
| `.p12` DGII (RD) + rangos eNCF      | CA acreditada INDOTEL + DGII Oficina Virtual | e-CF (1)(2)(3)      |
| Certificado FNMT/representante (ES) | FNMT o QTSP                                  | Verifactu (1)(2)(3) |
| Acceso a bancos de prueba           | DGII CerteCF / AEAT                          | Certificar ambos    |

Cobro online RD (Azul): aparcado por decisión del owner; ver la recomendación en el historial (afiliación
Azul + sandbox de `dev.azul.com.do`). El `PaymentProvider` ya selecciona por jurisdicción (stub RD activo).
