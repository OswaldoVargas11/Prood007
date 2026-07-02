/**
 * Playbooks SEMILLA por jurisdicción: un ejemplo realista de posiciones de despacho para revisar un
 * contrato de prestación de servicios (el tipo más común de contrato entrante). Sirven de plantilla de
 * onboarding: se instalan bajo demanda (endpoint idempotente por nombre), el despacho los edita después.
 * No se instalan al registrar el tenant (la biblioteca empieza vacía, como plantillas y cláusulas).
 */

export interface PlaybookSeedRule {
  topic: string;
  preferredText: string;
  acceptableText?: string;
  dealBreakers?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface PlaybookSeed {
  name: string;
  description: string;
  jurisdiction: 'es' | 'do';
  rules: PlaybookSeedRule[];
}

const SEED_ES: PlaybookSeed = {
  name: 'Prestación de servicios (posiciones del despacho) — ejemplo',
  description:
    'Playbook de ejemplo para revisar contratos de prestación de servicios recibidos de la otra parte. ' +
    'Edita cada regla con las posiciones reales del despacho.',
  jurisdiction: 'es',
  rules: [
    {
      topic: 'Limitación de responsabilidad',
      preferredText:
        'La responsabilidad total de cada parte por daños derivados del presente contrato queda limitada ' +
        'al importe efectivamente pagado por los servicios durante los doce (12) meses anteriores al hecho ' +
        'que origine la reclamación. Queda excluida la responsabilidad por lucro cesante y daños indirectos. ' +
        'Esta limitación no se aplica en casos de dolo o culpa grave, ni a los daños causados a las personas.',
      acceptableText:
        'Un límite igual o superior al importe anual del contrato, o una limitación mutua equivalente. ' +
        'Aceptable excluir daños indirectos si la exclusión es recíproca.',
      dealBreakers:
        'Responsabilidad ilimitada solo para nuestra parte; exclusión total de responsabilidad de la otra ' +
        'parte; límites inferiores a tres (3) meses de honorarios.',
      severity: 'HIGH',
    },
    {
      topic: 'Ley aplicable y jurisdicción',
      preferredText:
        'El presente contrato se rige por la legislación española. Las partes se someten a los Juzgados y ' +
        'Tribunales de la ciudad de Madrid, con renuncia expresa a cualquier otro fuero que pudiera ' +
        'corresponderles.',
      acceptableText:
        'Ley española con sumisión a otros tribunales españoles, o arbitraje con sede en España ' +
        '(Corte de Arbitraje de Madrid o similar).',
      dealBreakers: 'Ley extranjera o sumisión a tribunales o arbitraje fuera de España.',
      severity: 'MEDIUM',
    },
    {
      topic: 'Confidencialidad',
      preferredText:
        'Cada parte se obliga a mantener la confidencialidad de la información recibida de la otra parte ' +
        'con ocasión del presente contrato, obligación que subsistirá durante la vigencia del contrato y ' +
        'los tres (3) años siguientes a su terminación. Se exceptúa la información pública, la conocida ' +
        'previamente y la que deba revelarse por imperativo legal o requerimiento de autoridad competente.',
      acceptableText:
        'Obligación mutua con duración de dos (2) a cinco (5) años tras la terminación y excepciones estándar.',
      dealBreakers: 'Obligación de confidencialidad unilateral que solo vincule a nuestra parte.',
      severity: 'MEDIUM',
    },
    {
      topic: 'Protección de datos personales',
      preferredText:
        'En la medida en que la prestación implique el acceso a datos personales responsabilidad de la otra ' +
        'parte, las partes suscribirán un acuerdo de encargo de tratamiento conforme al artículo 28 del ' +
        'Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018, que regulará el objeto, la duración, ' +
        'la naturaleza y la finalidad del tratamiento.',
      acceptableText:
        'Cláusula de encargo de tratamiento integrada en el propio contrato con el contenido mínimo del ' +
        'art. 28.3 RGPD.',
      dealBreakers:
        'Ausencia total de régimen de protección de datos cuando el servicio implica tratar datos ' +
        'personales; autorización general e incondicionada de subencargados sin derecho de oposición.',
      severity: 'HIGH',
    },
    {
      topic: 'Condiciones de pago e intereses de demora',
      preferredText:
        'Las facturas se abonarán en el plazo máximo de treinta (30) días desde su fecha de emisión. En caso ' +
        'de retraso, se devengarán automáticamente los intereses de demora y la indemnización por costes de ' +
        'cobro previstos en la Ley 3/2004, de 29 de diciembre, sin necesidad de intimación previa.',
      acceptableText:
        'Plazo de pago de hasta sesenta (60) días si lo permite la normativa aplicable.',
      dealBreakers:
        'Pago condicionado a hitos indeterminados o a la aprobación discrecional de la otra parte; ' +
        'renuncia a los intereses de demora legales.',
      severity: 'MEDIUM',
    },
    {
      topic: 'Terminación y preaviso',
      preferredText:
        'Cualquiera de las partes podrá resolver el contrato mediante preaviso escrito de treinta (30) días. ' +
        'La resolución no afectará a los importes devengados hasta la fecha de efectos, que serán exigibles ' +
        'en sus términos.',
      acceptableText: 'Preaviso de quince (15) a noventa (90) días, simétrico para ambas partes.',
      dealBreakers:
        'Facultad de resolución inmediata y sin causa solo a favor de la otra parte; penalizaciones por ' +
        'terminación exigibles únicamente a nuestra parte.',
      severity: 'MEDIUM',
    },
    {
      topic: 'Propiedad intelectual de los entregables',
      preferredText:
        'Los derechos de propiedad intelectual sobre los entregables desarrollados específicamente en ' +
        'ejecución del contrato se cederán al cliente con el pago íntegro del precio. El prestador conserva ' +
        'la titularidad de sus herramientas, metodologías y conocimientos previos (background IP), sobre los ' +
        'que concede una licencia de uso no exclusiva en lo necesario para explotar los entregables.',
      acceptableText:
        'Licencia amplia, irrevocable y transferible sobre los entregables si la cesión plena no es posible.',
      dealBreakers:
        'Cesión del background IP o de desarrollos previos; prohibición de reutilizar conocimientos ' +
        'generales adquiridos.',
      severity: 'HIGH',
    },
  ],
};

const SEED_DO: PlaybookSeed = {
  name: 'Prestación de servicios (posiciones del despacho) — ejemplo',
  description:
    'Playbook de ejemplo para revisar contratos de prestación de servicios recibidos de la contraparte. ' +
    'Edite cada regla con las posiciones reales de la firma.',
  jurisdiction: 'do',
  rules: [
    {
      topic: 'Limitación de responsabilidad',
      preferredText:
        'La responsabilidad total de cada parte por daños derivados del presente contrato queda limitada al ' +
        'monto efectivamente pagado por los servicios durante los doce (12) meses anteriores al hecho que ' +
        'origine la reclamación. Se excluye la responsabilidad por lucro cesante y daños indirectos. Esta ' +
        'limitación no aplica en casos de dolo o falta grave.',
      acceptableText:
        'Un límite igual o superior al monto anual del contrato, o una limitación mutua equivalente.',
      dealBreakers:
        'Responsabilidad ilimitada solo para nuestra parte; exclusión total de responsabilidad de la ' +
        'contraparte; límites inferiores a tres (3) meses de honorarios.',
      severity: 'HIGH',
    },
    {
      topic: 'Ley aplicable y jurisdicción',
      preferredText:
        'El presente contrato se rige por las leyes de la República Dominicana. Las partes se someten a la ' +
        'jurisdicción de los tribunales del Distrito Nacional, con renuncia a cualquier otro fuero.',
      acceptableText:
        'Ley dominicana con sumisión a otros tribunales dominicanos, o arbitraje ante el Centro de ' +
        'Resolución Alternativa de Controversias (CRC) de la Cámara de Comercio y Producción de Santo Domingo.',
      dealBreakers:
        'Ley extranjera o sumisión a tribunales o arbitraje fuera de la República Dominicana.',
      severity: 'MEDIUM',
    },
    {
      topic: 'Confidencialidad',
      preferredText:
        'Cada parte se obliga a mantener la confidencialidad de la información recibida de la otra parte con ' +
        'ocasión del presente contrato, obligación que subsistirá durante la vigencia del contrato y los ' +
        'tres (3) años siguientes a su terminación, con las excepciones de información pública, conocida ' +
        'previamente o requerida por autoridad competente.',
      acceptableText:
        'Obligación mutua con duración de dos (2) a cinco (5) años tras la terminación y excepciones estándar.',
      dealBreakers: 'Obligación de confidencialidad unilateral que solo vincule a nuestra parte.',
      severity: 'MEDIUM',
    },
    {
      topic: 'Protección de datos personales',
      preferredText:
        'Las partes cumplirán la Ley No. 172-13 sobre Protección de Datos de Carácter Personal en el ' +
        'tratamiento de los datos personales a los que accedan con ocasión del contrato, limitando su uso a ' +
        'la prestación de los servicios y adoptando medidas de seguridad adecuadas.',
      acceptableText:
        'Remisión general a la normativa de protección de datos aplicable con deber de seguridad.',
      dealBreakers:
        'Autorización para usar los datos personales del cliente con fines propios o cederlos a terceros ' +
        'sin consentimiento.',
      severity: 'HIGH',
    },
    {
      topic: 'Condiciones de pago e ITBIS',
      preferredText:
        'Las facturas, con comprobante fiscal válido, se pagarán en un plazo máximo de treinta (30) días ' +
        'desde su emisión. Los precios se entienden sin incluir el ITBIS, que se trasladará en la factura ' +
        'cuando aplique conforme al Código Tributario.',
      acceptableText: 'Plazo de pago de hasta sesenta (60) días con facturación mensual.',
      dealBreakers:
        'Pago condicionado a la aprobación discrecional de la contraparte; obligación de asumir impuestos ' +
        'que legalmente corresponden a la otra parte.',
      severity: 'MEDIUM',
    },
    {
      topic: 'Terminación y preaviso',
      preferredText:
        'Cualquiera de las partes podrá terminar el contrato mediante comunicación escrita con treinta (30) ' +
        'días de antelación. La terminación no afectará los montos devengados hasta la fecha de efectividad.',
      acceptableText: 'Preaviso de quince (15) a noventa (90) días, simétrico para ambas partes.',
      dealBreakers:
        'Facultad de terminación inmediata y sin causa solo a favor de la contraparte; penalidades por ' +
        'terminación exigibles únicamente a nuestra parte.',
      severity: 'MEDIUM',
    },
    {
      topic: 'Propiedad intelectual de los entregables',
      preferredText:
        'Los derechos de propiedad intelectual sobre los entregables desarrollados específicamente en ' +
        'ejecución del contrato se cederán al cliente con el pago íntegro del precio, conforme a la Ley ' +
        'No. 65-00 sobre Derecho de Autor. El prestador conserva sus herramientas, metodologías y ' +
        'conocimientos previos, con licencia de uso no exclusiva a favor del cliente en lo necesario.',
      acceptableText:
        'Licencia amplia, irrevocable y transferible sobre los entregables si la cesión plena no es posible.',
      dealBreakers:
        'Cesión de desarrollos previos o prohibición de reutilizar conocimientos generales.',
      severity: 'HIGH',
    },
  ],
};

/** Semilla para la jurisdicción del despacho (los duales usan la ES). */
export function playbookSeedFor(jurisdiction: string): PlaybookSeed {
  return jurisdiction === 'do' ? SEED_DO : SEED_ES;
}
