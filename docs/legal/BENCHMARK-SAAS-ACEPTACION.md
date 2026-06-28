# Cómo gestionan los grandes SaaS la capa de aceptación legal — benchmark + propuesta para Lawzora

**Fecha:** 2026-06-28 · **Método:** workflow multi-agente (6 dimensiones investigadas + verificación adversarial de fuentes + síntesis). Confianza alta en las 6; afirmaciones sin fuente verificable marcadas como "a confirmar". · **Audiencia:** ingeniero de ciberseguridad (lenguaje llano).

Lawzora vende a dos públicos: despachos (profesionales) y particulares (consumidores). Decisión ya tomada: **clickwrap reforzado sin proveedor de firma** (registro inmutable con hash SHA-256 del texto, IP, user-agent, versión, timestamp + certificado PDF por email). Esta propuesta no la re-discute: la confirma donde la investigación lo respalda y la matiza donde hace falta.

Idea que atraviesa todo: **el "documento" legal y la "prueba de aceptación" son dos cosas distintas.** Los grandes separan el texto (versionado, público) del registro de quién-aceptó-qué-cuándo (audit trail). Tu clickwrap reforzado es el segundo. Encaja con el patrón del sector.

---

## 1. DPA: ¿online o firmado?

El DPA (Data Processing Agreement / Acuerdo de Encargado del Tratamiento) regula cómo Lawzora trata datos personales en nombre del despacho (el despacho es "responsable", Lawzora "encargado").

**Qué hacen los grandes.** Casi nadie lo firma a mano. Lo incorporan "por referencia" dentro de los términos del servicio y entra en vigor automáticamente al aceptar esos términos o al empezar a usar el producto. Stripe lo mete en el Stripe Services Agreement; AWS lo embebió en sus Service Terms (aplica automáticamente sin acción extra); HubSpot: "se incorpora y forma parte de los Customer Terms of Service"; Atlassian: "aplica automáticamente al aceptar el Customer Agreement, no hace falta firmarlo". Todos ofrecen un PDF descargable (a veces pre-firmado por ellos) para archivo, pero la firma NO es condición de validez. Las SCCs (cláusulas de transferencia internacional) van dentro del propio DPA. Único outlier: OpenAI exige un formulario online para cuentas business y devuelve PDF contrafirmado.

**Recomendación.**

- DPA como documento incorporado por referencia a los ToS profesionales: "Al aceptar estos Términos, el Despacho acepta el Acuerdo de Encargado del Tratamiento, que forma parte integrante de este contrato."
- Captura la aceptación del DPA **en el mismo clic** que los ToS profesionales, con el registro reforzado. Esto te da algo que la mayoría no tiene tan limpio: prueba explícita por tenant de qué versión del DPA aceptó y cuándo.
- Genera el PDF-certificado del DPA y mándalo (Brevo), idealmente pre-firmado por Lawzora.

**Encaje:** confirma el clickwrap reforzado y lo mejora. Los grandes ni registran aceptación explícita del DPA (la derivan del uso); tú vas un paso por encima. No necesitas Signaturit.

Fuentes: stripe.com/legal/dpa · aws.amazon.com/blogs/security/aws-gdpr-data-processing-addendum · legal.hubspot.com/dpa · atlassian.com/legal/data-processing-addendum · cloud.google.com/terms/data-processing-addendum · openai.com/policies/data-processing-addendum

---

## 2. Subprocesadores

Tercero que trata datos de los despachos: Neon (BD), Cloudflare/R2, Brevo (email), Anthropic/Voyage (IA), Fly (hosting). La ley obliga a listarlos y avisar antes de añadir uno nuevo, con derecho de oposición.

**Qué hacen los grandes.** Tres piezas siempre iguales: (1) **página pública** con la lista + changelog "What's Changed"; (2) **suscripción opt-in por email** (el RSS desapareció): Datadog/AWS con formulario, Stripe vía preferencias, Notion con email de asunto fijo; (3) **preaviso + ventana de objeción** con "silencio = aceptación". Plazo estándar **30 días** (Stripe, AWS, OpenAI, Datadog); infra/seguridad usa más corto (Vanta/Cloudflare 10 días). Detalle Vanta a copiar: **si no te suscribes, renuncias al aviso previo**.

**Recomendación.** Página pública (tabla: nombre, función, país, fecha de alta + changelog) · **lista versionada con hash** (esto toca BD) · suscripción opt-in vía Brevo · preaviso 30 días + objeción 30 días + cláusula Vanta. La objeción es un proceso (resolver de buena fe; si el servicio depende de ese subprocesador, el despacho puede cancelar) → va en el texto del DPA, no en código.

**Encaje:** confirma y extiende. No lo tenías. Lo nuevo es la **lista versionada + envío de avisos**, no una aceptación; el DPA ya incorpora por referencia "la lista vigente en cada momento".

Fuentes: stripe.com/legal/service-providers · aws.amazon.com/compliance/sub-processors · cloudflare.com/gdpr/subprocessors · trust.vanta.com/subprocessors · datadoghq.com/legal/subprocessors · platform.openai.com/subprocessors

---

## 3. Versionado y re-aceptación

¿Modal bloqueante para re-aceptar, o basta con avisar?

**Qué hacen los grandes.** (1) **Versionado público** con "última actualización" + archivo de versiones; el estándar de excelencia es git (GitHub publica todo en el repo público `github/site-policy`, cada cambio es un commit con diff; Google ofrece comparador). (2) **Aviso previo solo de cambios MATERIALES** (precio, recorte de derechos, nuevo tratamiento), ~30 días, con resumen llano; features nuevas y urgencias legales quedan exentas. (3) **El mecanismo dominante es "uso continuado = aceptación"**, NO modal forzoso (GitHub, Slack, Stripe, Dropbox). El **modal bloqueante se reserva** a contextos regulados/de pago (Stripe Connect recaptura aceptación por API ante cambios de KYC/titularidad).

**Recomendación — dos velocidades.** Cambio menor → versión nueva + fecha de efecto + changelog, sin aviso, uso continuado = aceptación. Cambio material → email con 30 días + resumen llano. **Re-aceptación explícita (clickwrap forzado al login) SOLO** para: DPA con cambio material, cambios que la ley exija consentir, o cambio de entidad contratante. Versiona los documentos como activos con hash; el clickwrap apunta a ese hash.

**Encaje:** confirma con un matiz: tu clickwrap registra un hash de versión → **necesitas un modelo de versiones de documento** del que cuelguen las aceptaciones. Trampa a evitar: no fuerces modal para todo (castiga a todos los usuarios); usa "uso continuado" por defecto.

Fuentes: github.com/github/site-policy · policies.google.com/terms/archive · dropbox.com/terms · slack.com/terms-of-service · docs.stripe.com/connect/updating-service-agreements

---

## 4. Clickwrap y exigibilidad

Qué hace que un "Acepto" aguante en un juicio.

**Qué hacen los grandes.** Convergen (Ironclad, DocuSign, TermsFeed): (1) clickwrap, no browsewrap (nada de enlaces escondidos en el footer); (2) **acción afirmativa explícita** — casilla NO premarcada o botón "Acepto" obligatorio (las premarcadas socavan la validez); (3) **aviso visible junto al botón**: "Al continuar aceptas los [Términos] y la [Privacidad]" con esos nombres hiperenlazados y sin scroll; (4) lenguaje claro; (5) **audit trail inmutable** por aceptación: identidad, timestamp, IP/dispositivo, versión exacta y snapshot de lo mostrado. Caso de referencia EEUU: Meyer v. Uber (2017). (Dato Ironclad clickwrap gana ~70% vs ~14% browsewrap — _a confirmar, cifra de 2020_.)

Matiz UE que no puedes ignorar: **el clic NO convierte una cláusula abusiva en válida**. La Directiva 93/13/CEE somete las cláusulas no negociadas a control de transparencia/abusividad frente a consumidores (arbitraje forzoso, límites de responsabilidad, foro pueden no vincular a un particular aunque haya clicado). _(A confirmar: no hay sentencia TJUE citada aplicándola a un clickwrap concreto; es interpretación sólida de la Directiva, no jurisprudencia verificada.)_

**Recomendación.** Casilla **no premarcada** (o botón "Crear cuenta y aceptar") obligatoria, aviso visible con enlaces sin scroll. Tu audit trail ya cubre identidad/timestamp/IP/UA/versión: **añade el "snapshot de lo mostrado"** (registra de forma determinista qué microcopia + qué documentos enlazados + sus versiones se renderizaron; no hace falta captura de imagen). Registro append-only (tu AuditLog o tabla solo-inserción). Para consumidor, destaca las cláusulas sensibles en lenguaje claro.

**Encaje:** confirma de lleno. El clickwrap reforzado ES lo que el sector considera exigible. Único hueco vs. mejor práctica: el **snapshot de lo mostrado**. Un proveedor de firma no añade exigibilidad aquí.

Fuentes: ironcladapp.com/journal/contract-management/6-components-of-clickwrap-enforceability · ironcladapp.com/journal/contracts/clickwrap-vs-browsewrap · law.justia.com (Meyer v. Uber, 2nd Cir. 2017) · commission.europa.eu (Unfair Contract Terms Directive)

---

## 5. Términos de consumidor + renuncia al desistimiento

Un particular UE tiene 14 días para desistir. Si das acceso inmediato, necesitas que **renuncie expresamente** o tendrías que reembolsar aunque ya haya usado el producto.

**Qué hacen los grandes.** No publican dos documentos B2B/B2C separados: usan **un acuerdo de consumidor con cláusula "Right of withdrawal"** que combina las DOS piezas que exige la Directiva 2011/83/UE: (1) **consentimiento previo expreso** al inicio inmediato y (2) **reconocimiento de que con ello pierde** el desistimiento. Texto canónico de Spotify: "you expressly consent... immediately... and acknowledge that you lose your right of withdrawal". Steam lo recoge **en el checkout** con consentimiento expreso previo. Mejor práctica (Osborne Clarke): capturarlo como **acción afirmativa en el flujo de compra** (no enterrarlo solo en los términos); Spotify/Steam se acercan más, Apple/Netflix lo redactan como mero reconocimiento (mayor riesgo). Matiz: opinión del Abogado General TJUE (caso Sky Österreich C-234/25, 26-feb-2026 — _opinión, no sentencia_) sugiere tratar el servicio digital como "servicio" y que la renuncia surte efecto al ejecutarse del todo → prudente combinar renuncia expresa + reembolso prorrateado.

**Recomendación.** Crea **ToS de consumidor** (no los tienes) con cláusula de desistimiento clara; un único documento con secciones condicionadas ("Si eres consumidor…/Si contratas como despacho…") mejor que dos. En el checkout del particular, **casilla dedicada no premarcada**: "Pido empezar a usar Lawzora inmediatamente y entiendo que pierdo mi derecho de desistimiento de 14 días." Captúrala con el clickwrap reforzado + PDF. Trata la suscripción como servicio: si cancela en 14 días y NO renunció, reembolso prorrateado. A los despachos (profesionales) no les muestres esta casilla.

**Encaje:** confirma y añade alcance (trabajo nuevo). El clickwrap reforzado es justo el mecanismo correcto para capturar la renuncia de forma auditable.

Fuentes: spotify.com/legal/end-user-agreement · store.steampowered.com/subscriber_agreement · apple.com/legal/internet-services/itunes · help.netflix.com/node/43703 · osborneclarke.com (Apple 14-day refunds)

---

## 6. Impuestos B2B/B2C

No es "aceptación legal", pero comparte la raíz: **distinguir profesional de consumidor**, y lo decide el mismo dato (¿NIF/IVA válido?).

**Qué hacen los grandes.** (1) **B2B vs B2C se decide por la presencia de un IVA VÁLIDO**, no por el tipo de cuenta: con IVA válido + operación transfronteriza UE → "reverse charge" (impuesto cero + nota, el cliente autoliquida); sin IVA válido → consumidor, se cobra IVA (Stripe Tax, Chargebee, Paddle, Quaderno). (2) El IVA se **valida en tiempo real contra VIES** (registro oficial UE); re-validación periódica (Chargebee cada 3 meses). (3) El país **NO se decide por IP sola**: jerarquía dirección > facturación > país del método de pago > IP; si la dirección es inválida, **falla con error en vez de adivinar**; la UE exige ≥2 evidencias no contradictorias conservadas 10 años. (4) OSS: por debajo de **10.000 €** de ventas B2C transfronterizas UE, tipo de origen; por encima, tipo de destino + registro OSS. La divisa NUNCA decide el impuesto.

**Recomendación.** Decide B2B/B2C por **NIF-IVA validado contra VIES** (ES/UE) y RNC equivalente para RD; guarda el resultado (Válido/Inválido/Indeterminado) y re-valida. País por jerarquía de evidencias, error si la dirección es inválida. Coherente con tu base fiscal madura (eNCF/DGII, Verifactu). Monitoriza el umbral OSS si crece el volumen UE.

**Encaje:** complementa. No toca el clickwrap pero comparte el flag "¿profesional o consumidor?". **El mismo flag** que decide qué ToS/desistimiento mostrar debe ser coherente con el que decide el IVA: ambos anclados en "¿tiene NIF/IVA válido?". Una única fuente de verdad.

Fuentes: docs.stripe.com/tax/zero-tax · docs.stripe.com/tax/customer-locations · chargebee.com/docs/billing/2.0/taxes/eu-vat · paddle.com/help/sell/tax · quaderno.io/guides/eu-vat

---

## Cuadro resumen: patrón del sector → qué hace Lawzora

| Dimensión                  | Patrón del sector                                                                                                                                        | Qué hace Lawzora                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| DPA                        | Incorporado por referencia a los ToS, sin firma; PDF a petición                                                                                          | Incorporado por referencia + **aceptación clickwrap registrada por tenant** (hash/IP/UA/versión) + PDF pre-firmado. Un paso por encima. |
| Subprocesadores            | Página pública + suscripción email + 30 días preaviso/objeción; "no suscrito = renuncia aviso"                                                           | Página pública + lista **versionada con hash** + suscripción Brevo + 30 días + cláusula Vanta. (Nuevo.)                                 |
| Versionado / re-aceptación | "Última actualización" + archivo de versiones; aviso 30 días solo cambios materiales; **uso continuado = aceptación**; modal solo en contextos regulados | Documentos versionados con hash + changelog; uso continuado por defecto; **modal reservado** a DPA material y consentimientos legales.  |
| Clickwrap                  | Casilla no premarcada, aviso visible junto al botón, audit trail con snapshot de lo mostrado                                                             | Clickwrap reforzado ya alineado; **falta añadir el snapshot de lo mostrado**. Sin proveedor de firma.                                   |
| Consumidor / desistimiento | Un acuerdo con cláusula de desistimiento; renuncia expresa como **acción afirmativa en checkout**; tratar como servicio + prorrateo                      | ToS de consumidor nuevos + **casilla dedicada de renuncia** capturada por clickwrap; reembolso prorrateado si no renuncia. (Nuevo.)     |
| Impuestos                  | B2B = IVA válido en VIES → reverse charge; país por evidencias, no IP; umbral OSS 10.000 €                                                               | Validación VIES/RNC como fuente del flag profesional/consumidor; país por jerarquía de evidencias.                                      |

---

## Qué construir (priorizado) — **[BD]** = toca base de datos / migración

**P0 — núcleo de aceptación (habilita todo lo demás)**

1. **[BD] Modelo de versiones de documento legal** (`LegalDocument`): tipo (tos_pro, tos_consumer, privacy, dpa, subprocessors), versión, texto, hash SHA-256, fecha de efecto, estado. Cada versión inmutable. _(Hoy no existe.)_
2. **[BD] Modelo de aceptación** (`LegalAcceptance`, append-only): usuario/tenant, documento+versión (FK al hash), IP, user-agent, timestamp, **snapshot de lo mostrado**, tipo de acto (alta, re-aceptación, renuncia desistimiento). RLS por tenant; patrón append-only del AuditLog.
3. **PDF-certificado + email** (Brevo): certificado de aceptación (usuario, documento, versión, hash, fecha, IP). Reutiliza generación PDF existente.

**P1 — los dos públicos** 4. **DPA formal + incorporación por referencia** en ToS profesionales, con captura de aceptación en el alta del despacho (usa P0). 5. **ToS de consumidor + casilla de renuncia al desistimiento** no premarcada en el checkout del particular (usa P0). Reembolso prorrateado si no renunció. 6. **UI de clickwrap** alineada: casilla no premarcada / aviso visible junto al botón / enlaces sin scroll, en alta y checkout.

**P2 — subprocesadores** 7. **[BD] Lista de subprocesadores versionada** (`Subprocessor` + versionado con hash y fecha de efecto); página pública en Next + changelog. 8. **[BD] Suscripción + notificación de cambios** (Brevo): opt-in (tabla de suscriptores), preaviso 30 días, objeción 30 días, cláusula "no suscrito = renuncia al aviso".

**P3 — re-aceptación y fiscal** 9. **Lógica de re-aceptación de dos velocidades**: cambio menor = uso continuado; material = aviso 30 días; modal forzoso solo para DPA material/consentimientos legales. Detecta "versión vigente ≠ última aceptada". 10. **Fuente única del flag profesional/consumidor** anclada en **validación VIES/RNC**, compartida por la lógica de ToS/desistimiento y la fiscal. Re-validación periódica.

---

## A confirmar con asesor legal (no es ingeniería; no bloquea el modelo de datos P0)

- Validez del clickwrap bajo art. 28.3 RGPD ("por escrito, incluido formato electrónico"): ampliamente aceptada por la industria, sin jurisprudencia AEPD/EDPB citada aquí.
- Sky Österreich (C-234/25) es **opinión del Abogado General (feb-2026), no sentencia firme**; "streaming = servicio" puede cambiar.
- Aplicación fina por país (eIDAS, consumo ES vs. legislación dominicana) no se verificó en esta investigación; revísalo antes de los textos definitivos.
