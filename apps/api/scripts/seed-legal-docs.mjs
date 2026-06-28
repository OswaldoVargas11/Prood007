// Publica/actualiza el catálogo de documentos legales versionados (LegalDocument) desde los .md de
// prisma/seed-data/legal. Idempotente: la versión = fecha del front-matter; si ya existe esa versión
// (mismo type+jurisdiction+locale+version) no la duplica. Al publicar una versión nueva, desmarca la
// anterior vigente del mismo (type, jurisdiction, locale) y marca esta como isCurrent.
//
// Escribe en una tabla GLOBAL cuyo INSERT solo tiene el rol de sistema → conecta por SYSTEM_DATABASE_URL
// (o DIRECT_DATABASE_URL en dev). Ejecutar tras migrar: `node scripts/seed-legal-docs.mjs`.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'prisma', 'seed-data', 'legal');

const url =
  process.env.SYSTEM_DATABASE_URL || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Falta SYSTEM_DATABASE_URL / DIRECT_DATABASE_URL / DATABASE_URL.');
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

/** Parser minimalista de front-matter `--- key: value ---` + cuerpo markdown. */
function parse(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) throw new Error('Documento sin front-matter válido.');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

async function main() {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  let published = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = readFileSync(join(CONTENT_DIR, file), 'utf8');
    const { meta, body } = parse(raw);
    const { type, version, title } = meta;
    const jurisdiction = meta.jurisdiction && meta.jurisdiction !== 'null' ? meta.jurisdiction : null;
    const locale = meta.locale || 'es';
    if (!type || !version || !title) {
      throw new Error(`${file}: faltan type/version/title en el front-matter.`);
    }
    const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');

    // findFirst (no findUnique): Prisma rechaza `null` en una clave única compuesta con campo nullable.
    const existing = await prisma.legalDocument.findFirst({
      where: { type, jurisdiction, locale, version },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.$transaction([
      // Desmarca la versión vigente anterior de este (type, jurisdiction, locale).
      prisma.legalDocument.updateMany({
        where: { type, jurisdiction, locale, isCurrent: true },
        data: { isCurrent: false },
      }),
      prisma.legalDocument.create({
        data: {
          type,
          jurisdiction,
          locale,
          version,
          title,
          body,
          bodyHash,
          sourceRef: meta.sourceRef || `prisma/seed-data/legal/${file}`,
          effectiveFrom: new Date(meta.effectiveFrom || version),
          isCurrent: true,
        },
      }),
    ]);
    published += 1;
    console.log(`✓ ${type} v${version} (${jurisdiction ?? 'global'}/${locale}) publicado.`);
  }

  console.log(`\nLegalDocument: ${published} publicados, ${skipped} ya existentes.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
