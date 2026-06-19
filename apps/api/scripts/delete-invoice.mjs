/**
 * Borra UNA factura por id (y sus dependencias) — utilidad puntual para limpiar datos de prueba.
 * Borra primero los apuntes de libro mayor enlazados (invoiceId) y luego la factura (sus líneas y
 * recordatorios caen por cascade). Acotado estrictamente al id pasado por argumento. Idempotente.
 *
 * Uso: node scripts/delete-invoice.mjs <invoiceId>
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

const id = process.argv[2];
if (!id) {
  console.error('Falta el invoiceId. Uso: node scripts/delete-invoice.mjs <invoiceId>');
  process.exit(1);
}

const url =
  process.env.SYSTEM_DATABASE_URL || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, number: true, currency: true, tenantId: true },
  });
  if (!inv) {
    console.log(`No existe factura ${id} (ya borrada).`);
  } else {
    console.log(`Borrando factura ${inv.number} (${inv.currency}) del tenant ${inv.tenantId}…`);
    await prisma.$transaction([
      prisma.ledgerEntry.deleteMany({ where: { invoiceId: id } }),
      prisma.invoice.delete({ where: { id } }),
    ]);
    console.log('Borrada (con líneas y apuntes asociados).');
  }
} finally {
  await prisma.$disconnect();
}
