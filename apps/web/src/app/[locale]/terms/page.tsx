import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Condiciones del servicio',
  description: 'Condiciones de uso de la plataforma Lawzora para despachos de abogados.',
  alternates: { canonical: '/es/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Condiciones del servicio" updated="20 de junio de 2026">
      <p>
        Estas condiciones regulan el acceso y uso de <strong>Lawzora</strong> (la «Plataforma»), un
        software de gestión para despachos de abogados. Al registrarte o utilizar la Plataforma,
        aceptas estas condiciones. Si las aceptas en nombre de un despacho, declaras tener autoridad
        para vincularlo.
      </p>

      <h2>1. Titular</h2>
      <p>
        La Plataforma es operada por <strong>Lawzora</strong> [razón social del titular]. Contacto:{' '}
        <a href="mailto:soporte@lawzora.com">soporte@lawzora.com</a>.
      </p>

      <h2>2. Descripción del servicio</h2>
      <p>
        Lawzora ofrece herramientas para la gestión de clientes, expedientes, documentos, plazos,
        facturación y comunicaciones, así como integraciones opcionales con servicios de terceros
        (por ejemplo, Google y Microsoft). Las funciones pueden evolucionar con el tiempo.
      </p>

      <h2>3. Cuentas y responsabilidad del usuario</h2>
      <ul>
        <li>Debes facilitar datos veraces y mantener la confidencialidad de tus credenciales.</li>
        <li>Eres responsable de la actividad realizada con tu cuenta.</li>
        <li>
          Eres responsable de la licitud de los datos que introduces y de contar con base legal para
          tratarlos, incluidos los datos de tus clientes.
        </li>
      </ul>

      <h2>4. Uso aceptable</h2>
      <p>
        No está permitido usar la Plataforma para fines ilícitos, vulnerar derechos de terceros,
        intentar acceder sin autorización a sistemas o datos, ni interferir en el funcionamiento del
        servicio.
      </p>

      <h2>5. Suscripción y pagos</h2>
      <p>
        El uso de las funciones de pago requiere una suscripción. Los pagos se procesan a través de
        Stripe. Salvo indicación en contrario, las suscripciones se renuevan según el periodo
        contratado; puedes gestionarlas o cancelarlas desde la propia Plataforma. Los importes ya
        devengados no son reembolsables salvo que la ley aplicable disponga otra cosa.
      </p>

      <h2>6. Datos y privacidad</h2>
      <p>
        El tratamiento de datos personales se rige por la{' '}
        <Link href="/privacy">Política de privacidad</Link>. Respecto a los datos de los clientes
        del despacho, Lawzora actúa como encargado del tratamiento por cuenta del despacho, que es
        el responsable.
      </p>

      <h2>7. Integraciones de terceros</h2>
      <p>
        Si conectas servicios de terceros (Google, Microsoft u otros), su uso se rige también por
        las condiciones y políticas de dichos proveedores. Puedes desconectarlos en cualquier
        momento desde Ajustes.
      </p>

      <h2>8. Propiedad intelectual</h2>
      <p>
        El software, la marca y los contenidos de la Plataforma pertenecen a Lawzora o a sus
        licenciantes. Los datos que introduces siguen siendo tuyos (o de tu despacho); nos concedes
        únicamente la licencia necesaria para prestarte el servicio.
      </p>

      <h2>9. Disponibilidad</h2>
      <p>
        Trabajamos para ofrecer un servicio estable, pero la Plataforma se presta «tal cual» y
        «según disponibilidad», sin garantía de funcionamiento ininterrumpido o libre de errores.
      </p>

      <h2>10. Limitación de responsabilidad</h2>
      <p>
        En la máxima medida permitida por la ley, Lawzora no responde de daños indirectos, lucro
        cesante o pérdida de datos. La Plataforma es una herramienta de apoyo y no sustituye el
        juicio profesional del abogado ni el cumplimiento de sus obligaciones deontológicas y de
        plazos.
      </p>

      <h2>11. Terminación</h2>
      <p>
        Puedes dejar de usar la Plataforma y cancelar tu suscripción en cualquier momento. Podemos
        suspender o cancelar el acceso ante incumplimientos de estas condiciones. Tras la baja, los
        datos se tratan conforme a la Política de privacidad.
      </p>

      <h2>12. Cambios</h2>
      <p>
        Podemos modificar estas condiciones; publicaremos la versión vigente en esta página. El uso
        continuado tras la actualización implica su aceptación.
      </p>

      <h2>13. Ley aplicable</h2>
      <p>
        Estas condiciones se rigen por la legislación aplicable en el lugar de establecimiento del
        titular, sin perjuicio de los derechos imperativos que correspondan a los consumidores y
        usuarios.
      </p>

      <h2>14. Contacto</h2>
      <p>
        <a href="mailto:soporte@lawzora.com">soporte@lawzora.com</a>
      </p>
    </LegalPage>
  );
}
