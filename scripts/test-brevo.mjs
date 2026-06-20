// Prueba de envío real vía Brevo SMTP. Carga las credenciales de apps/api/.env.production
// (gitignored) y envía un correo de prueba al destinatario indicado.
//   node scripts/test-brevo.mjs [destino]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import nodemailer from '../apps/api/node_modules/nodemailer/lib/nodemailer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', 'apps', 'api', '.env.production');

// Parser .env mínimo: KEY="value" / KEY=value, ignora comentarios.
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = parseEnv(readFileSync(envPath, 'utf8'));
const to = process.argv[2] || 'oswaldovargasrodriguez11@gmail.com';
const port = Number(env.SMTP_PORT ?? '587');

console.log(`SMTP host : ${env.SMTP_HOST}:${port}`);
console.log(`SMTP user : ${env.SMTP_USER}`);
console.log(`From      : ${env.MAIL_FROM}`);
console.log(`To        : ${to}`);

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const stamp = new Date().toISOString();

try {
  console.log('\nVerificando conexión/credenciales SMTP…');
  await transporter.verify();
  console.log('✓ SMTP verificado.');

  const info = await transporter.sendMail({
    from: env.MAIL_FROM,
    to,
    subject: `Prueba Brevo SMTP — Lawzora (${stamp})`,
    text:
      `Esto es un correo de prueba enviado desde el entorno LOCAL a través de Brevo SMTP relay.\n\n` +
      `Marca temporal: ${stamp}\n` +
      `Si recibes este mensaje, el envío transaccional vía Brevo funciona correctamente.`,
    html:
      `<h2>Prueba Brevo SMTP — Lawzora</h2>` +
      `<p>Correo de prueba enviado desde el entorno <strong>LOCAL</strong> a través de Brevo SMTP relay.</p>` +
      `<p>Marca temporal: <code>${stamp}</code></p>` +
      `<p>Si recibes este mensaje, el envío transaccional vía Brevo funciona correctamente. ✅</p>`,
  });

  console.log('\n✓ Correo aceptado por Brevo.');
  console.log('  messageId :', info.messageId);
  console.log('  response  :', info.response);
  console.log('  accepted  :', info.accepted);
  console.log('  rejected  :', info.rejected);
} catch (err) {
  console.error('\n✗ Error al enviar vía Brevo:', err?.message ?? err);
  process.exitCode = 1;
}
