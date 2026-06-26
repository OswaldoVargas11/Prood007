import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Cómo Lawzora trata los datos personales y los datos de las cuentas de Google y Microsoft.',
  alternates: { canonical: '/es/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad" updated="20 de junio de 2026">
      <p>
        Esta política explica cómo <strong>Lawzora</strong> (en adelante, «Lawzora», «nosotros»)
        trata los datos personales de los usuarios y de los despachos que utilizan la plataforma, en
        cumplimiento del Reglamento (UE) 2016/679 (RGPD), la LOPDGDD (España) y la Ley 172-13
        (República Dominicana).
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <p>
        Responsable: <strong>Lawzora</strong> [razón social del titular]. Para cualquier cuestión
        sobre privacidad o para ejercer tus derechos, escribe a{' '}
        <a href="mailto:privacidad@lawzora.com">privacidad@lawzora.com</a>.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Datos de cuenta</strong>: nombre, correo electrónico y credenciales de acceso.
        </li>
        <li>
          <strong>Datos del despacho</strong>: la información que tú introduces (clientes,
          expedientes, documentos, plazos, facturación), de la que el despacho es responsable.
        </li>
        <li>
          <strong>Datos de uso técnico</strong>: registros de acceso y eventos necesarios para la
          seguridad y el funcionamiento del servicio.
        </li>
        <li>
          <strong>Datos de cuentas conectadas (Google / Microsoft)</strong>: si decides conectar tu
          cuenta, los tokens de acceso (cifrados) y los datos estrictamente necesarios para las
          funciones que actives (ver sección 3).
        </li>
      </ul>

      <h2>3. Uso de datos de las APIs de Google y Microsoft</h2>
      <p>
        La conexión con Google o Microsoft es <strong>opcional</strong> y la activa cada usuario. Si
        la activas, Lawzora accede únicamente a lo necesario para:
      </p>
      <ul>
        <li>
          <strong>Calendario</strong> (Google Calendar / Outlook Calendar): crear y actualizar en tu
          calendario los eventos correspondientes a los plazos y tareas que tienes asignados.
        </li>
        <li>
          <strong>Correo</strong>: enviar mensajes que tú redactas desde la plataforma (Gmail
          «gmail.send» / Outlook «Mail.Send») y, solo en Microsoft, adjuntar a un expediente correos
          que tú selecciones de tu bandeja («Mail.Read»). En Gmail <strong>no</strong> leemos tu
          bandeja de entrada.
        </li>
      </ul>
      <p>
        El uso y la transferencia de la información recibida de las APIs de Google por parte de
        Lawzora se ajustan a la{' '}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Política de Datos de Usuario de los Servicios de las API de Google
        </a>
        , incluidos sus requisitos de <strong>Uso Limitado</strong> (Limited Use). En particular: no
        usamos los datos de Google para publicidad, no los vendemos, no los transferimos a terceros
        salvo para prestarte el servicio o por obligación legal, y no permitimos que personas lean
        estos datos salvo con tu consentimiento, para soporte, por seguridad o cuando lo exija la
        ley. El tratamiento de los datos de Microsoft sigue los mismos principios.
      </p>
      <p>
        Puedes revocar el acceso en cualquier momento desde <em>Ajustes → desconectar</em>.
      </p>

      <h2>4. Finalidad y base jurídica</h2>
      <p>
        Tratamos los datos para prestar el servicio contratado (ejecución del contrato), cumplir
        obligaciones legales, y por interés legítimo en la seguridad y mejora de la plataforma.
        Respecto a los datos de los clientes del despacho, Lawzora actúa como{' '}
        <strong>encargado del tratamiento</strong> por cuenta del despacho (responsable).
      </p>

      <h2>5. Conservación</h2>
      <p>
        Conservamos los datos mientras la cuenta esté activa y durante los plazos legales
        aplicables. Tras la baja, se eliminan o anonimizan salvo obligación legal de conservación.
      </p>

      <h2>6. Encargados y terceros (subencargados)</h2>
      <p>Nos apoyamos en proveedores que tratan datos por cuenta nuestra bajo contrato:</p>
      <ul>
        <li>Alojamiento e infraestructura (Fly.io; base de datos en Neon).</li>
        <li>Almacenamiento de documentos (Cloudflare R2).</li>
        <li>Envío de correos transaccionales (Brevo).</li>
        <li>Pagos y suscripciones (Stripe).</li>
        <li>Google y Microsoft, cuando conectas tu cuenta.</li>
      </ul>

      <h2>7. Transferencias internacionales</h2>
      <p>
        Cuando un proveedor trate datos fuera del EEE, se aplican garantías adecuadas (cláusulas
        contractuales tipo de la UE u otros mecanismos válidos).
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas: cifrado en tránsito (TLS) y en reposo (AES-256)
        de los datos sensibles, incluidos los tokens de Google y Microsoft, aislamiento de datos por
        despacho y control de acceso por roles.
      </p>

      <h2>9. Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y
        portabilidad escribiendo a{' '}
        <a href="mailto:privacidad@lawzora.com">privacidad@lawzora.com</a>. Tienes derecho a
        reclamar ante la autoridad de control (AEPD en España). Si los datos los gestiona un
        despacho como responsable, dirige tu solicitud a dicho despacho.
      </p>

      <h2>10. Cookies</h2>
      <p>
        Usamos únicamente cookies técnicas necesarias para la sesión y las preferencias; no
        utilizamos cookies publicitarias ni de seguimiento de terceros.
      </p>

      <h2>11. Cambios</h2>
      <p>
        Podemos actualizar esta política; publicaremos la versión vigente en esta página con su
        fecha de actualización.
      </p>

      <h2>12. Contacto</h2>
      <p>
        <a href="mailto:privacidad@lawzora.com">privacidad@lawzora.com</a>
      </p>
    </LegalPage>
  );
}
