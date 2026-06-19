/**
 * Limpia datos de prueba de QA: borra un expediente (con sus hijos), su cliente y una plantilla.
 * Uso: node scripts/delete-test-data.mjs <matterId> <clientId> <templateId>
 * Idempotente (deleteMany no falla si no hay filas).
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv(new URL('../.env.production', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
loadEnv(new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const [matterId, clientId, templateId] = process.argv.slice(2);
const url = process.env.SYSTEM_DATABASE_URL || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  if (matterId) {
    const acct = await prisma.retainerAccount.findUnique({ where: { matterId }, select: { id: true } });
    if (acct) {
      await prisma.retainerEntry.deleteMany({ where: { accountId: acct.id } });
      await prisma.retainerAccount.delete({ where: { id: acct.id } });
    }
    await prisma.ledgerEntry.deleteMany({ where: { matterId } });
    await prisma.timeEntry.deleteMany({ where: { matterId } });
    await prisma.task.deleteMany({ where: { matterId } });
    await prisma.message.deleteMany({ where: { matterId } });
    await prisma.document.deleteMany({ where: { matterId } });
    // Facturas (sus líneas y recordatorios caen por cascade) y pagos del expediente, antes del matter.
    await prisma.billingInstallment.deleteMany({ where: { schedule: { matterId } } }).catch(() => {});
    await prisma.billingSchedule.deleteMany({ where: { matterId } }).catch(() => {});
    await prisma.payment.deleteMany({ where: { matterId } }).catch(() => {});
    await prisma.invoice.deleteMany({ where: { matterId } });
    await prisma.matter.deleteMany({ where: { id: matterId } });
    console.log('matter + hijos borrados:', matterId);
  }
  if (clientId) {
    await prisma.kycProfile.deleteMany({ where: { clientId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    console.log('cliente borrado:', clientId);
  }
  if (templateId) {
    await prisma.documentTemplate.deleteMany({ where: { id: templateId } });
    console.log('plantilla borrada:', templateId);
  }
} finally {
  await prisma.$disconnect();
}
