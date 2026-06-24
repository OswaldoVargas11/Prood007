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
- ✅ Firma XML-DSig envuelta correcta (`dgii-signer.ts`).

**Pendiente (rellenar en certificación CerteCF con el cert real):**

1. **XAdES-BES** — añadir las propiedades cualificadas (`SigningTime`, `SigningCertificate`) y el
   `<Reference>` a `SignedProperties`. **Único punto:** `apps/api/src/dgii/dgii-signer.ts` →
   `signEnvelopedXml()` (el comentario marca el seam). El resto del flujo no cambia.
2. **Huella sobre el XML firmado** — calcular/persistir `recordHash` del e-CF sobre el XML **ya firmado**
   (hoy es sobre el XML previo a la firma). Punto: `packages/compliance/src/providers/dominican.provider.ts`.
3. **Activar transmisión** — `DGII_ENV=cert` (set de pruebas) → iterar hasta aprobar → `DGII_ENV=prod`.

Owner: RNC activo + `.p12` de una CA acreditada por INDOTEL + rangos eNCF aprobados en la Oficina Virtual.

---

## 🇪🇸 Verifactu (AEAT, ES)

Ya implementado y desplegable:

- ✅ Huella encadenada Verifactu (`SHA256(...|previousRecordHash)`), génesis `0…0`, registro de eventos
  inmutable (`FiscalEvent`) e inalterabilidad en BD.
- ✅ **Custodia del certificado de firma ES por despacho** (`verifactu-credential.service.ts`,
  `POST /verifactu/certificate`, FIRM_ADMIN) — FNMT/representante, SEPARADO del `.p12` de DGII.

**Pendiente (rellenar en certificación con el cert real):**

1. **Firma del registro** — firmar el registro Verifactu con el certificado del despacho. **Único punto:**
   nuevo `VerifactuSignerService` que consuma `VerifactuCredentialService.loadCert(tenantId)` (ya entrega el
   material PEM). El seam de carga del cert ya está; falta la función de firma según el formato AEAT.
2. **QR a producción** — hoy el QR apunta a preproducción (`prewww2.aeat.es`) en
   `packages/compliance/src/providers/spain.provider.ts`. Para producción: usar el host de producción de la
   AEAT (parametrizar la base del QR; mantener el default actual no rompe los golden).
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
