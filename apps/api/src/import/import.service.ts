import { Injectable } from '@nestjs/common';
import { Jurisdiction, TaxIdKind } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth.types';

/** Estado de una fila importada. */
export type RowStatus = 'ok' | 'duplicate' | 'error';

export interface PreviewRow {
  line: number;
  name: string;
  taxId: string;
  status: RowStatus;
  kind?: string;
  message?: string;
}

interface ParsedRow {
  line: number;
  name: string;
  taxId: string;
  docType?: TaxIdKind;
  email?: string;
  phone?: string;
  address?: string;
}

// Alias de cabecera (es/en, sin acentos) → campo canónico.
const HEADER_ALIASES: Record<string, keyof Omit<ParsedRow, 'line'>> = {
  name: 'name',
  nombre: 'name',
  cliente: 'name',
  'razon social': 'name',
  razonsocial: 'name',
  taxid: 'taxId',
  documento: 'taxId',
  nif: 'taxId',
  cif: 'taxId',
  nie: 'taxId',
  dni: 'taxId',
  rnc: 'taxId',
  cedula: 'taxId',
  'rnc/cedula': 'taxId',
  identificador: 'taxId',
  type: 'docType',
  tipo: 'docType',
  doctype: 'docType',
  'tipo documento': 'docType',
  email: 'email',
  correo: 'email',
  'e-mail': 'email',
  phone: 'phone',
  telefono: 'phone',
  tel: 'phone',
  address: 'address',
  direccion: 'address',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Importación de datos del despacho (migración desde Excel/otro software). Primera rebanada: CLIENTES.
 * Parseo CSV robusto (campos entrecomillados, CRLF, BOM), mapeo de cabecera por alias, validación fiscal
 * (cualquiera de las dos jurisdicciones, o pasaporte/otro) y deduplicación por documento. PREVIEW no
 * escribe; COMMIT crea los válidos no duplicados (idempotente: re-importar no duplica).
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
  ) {}

  /** Parser CSV (RFC-4180 básico): comillas, "" escapadas, \r\n, BOM. Devuelve matriz de strings. */
  private parseCsv(text: string): string[][] {
    const s = text.replace(/^﻿/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',' || c === ';') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c !== '\r') field += c;
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  }

  /** Mapea el CSV a filas tipadas usando la cabecera (con alias). Lanza si falta la columna de nombre. */
  private toRows(csv: string): ParsedRow[] {
    const grid = this.parseCsv(csv);
    if (grid.length < 2) return [];
    const header = grid[0]!.map((h) => HEADER_ALIASES[norm(h)] ?? null);
    return grid.slice(1).map((cols, idx) => {
      const r: ParsedRow = { line: idx + 2, name: '', taxId: '' };
      header.forEach((field, i) => {
        if (!field) return;
        const v = (cols[i] ?? '').trim();
        if (field === 'docType') {
          const t = norm(v);
          r.docType =
            t === 'passport' || t === 'pasaporte'
              ? TaxIdKind.PASSPORT
              : t === 'other' || t === 'otro'
                ? TaxIdKind.OTHER
                : undefined;
        } else r[field] = v;
      });
      return r;
    });
  }

  /** Valida el documento (cross-jurisdicción) y devuelve forma normalizada + tipo. */
  private validateDoc(
    user: RequestUser,
    taxId: string,
    docType?: TaxIdKind,
  ): { valid: boolean; kind?: string; normalized?: string } {
    const primary = this.compliance
      .forJurisdiction(user.jurisdiction)
      .validateTaxId(taxId, docType);
    if (primary.valid) return { valid: true, kind: primary.kind, normalized: primary.normalized };
    if (!docType) {
      const other = user.jurisdiction === Jurisdiction.ES ? Jurisdiction.DO : Jurisdiction.ES;
      const alt = this.compliance.forJurisdiction(other).validateTaxId(taxId);
      if (alt.valid) return { valid: true, kind: alt.kind, normalized: alt.normalized };
    }
    return { valid: false };
  }

  private isEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  /** Construye el preview por fila (no escribe). Devuelve también la lista de filas LISTAS para crear. */
  private async build(user: RequestUser, csv: string) {
    const rows = this.toRows(csv);
    const existing = new Set(
      (
        await this.prisma.client.findMany({
          where: { tenantId: user.tenantId },
          select: { taxId: true },
        })
      ).map((c) => c.taxId),
    );
    const seen = new Set<string>();
    const preview: PreviewRow[] = [];
    const toCreate: { row: ParsedRow; kind?: string; normalized: string }[] = [];

    for (const r of rows) {
      const base: PreviewRow = { line: r.line, name: r.name, taxId: r.taxId, status: 'ok' };
      if (!r.name || r.name.length < 2) {
        preview.push({
          ...base,
          status: 'error',
          message: 'Nombre requerido (mín. 2 caracteres).',
        });
        continue;
      }
      if (!r.taxId) {
        preview.push({ ...base, status: 'error', message: 'Documento requerido.' });
        continue;
      }
      if (r.email && !this.isEmail(r.email)) {
        preview.push({ ...base, status: 'error', message: `Email no válido: ${r.email}` });
        continue;
      }
      const v = this.validateDoc(user, r.taxId, r.docType);
      if (!v.valid) {
        preview.push({ ...base, status: 'error', message: 'Documento no válido (ES ni RD).' });
        continue;
      }
      const normalized = v.normalized ?? r.taxId;
      if (existing.has(normalized) || seen.has(normalized)) {
        preview.push({
          ...base,
          taxId: normalized,
          status: 'duplicate',
          kind: v.kind,
          message: 'Ya existe.',
        });
        continue;
      }
      seen.add(normalized);
      preview.push({ ...base, taxId: normalized, status: 'ok', kind: v.kind });
      toCreate.push({ row: r, kind: v.kind, normalized });
    }
    return { preview, toCreate };
  }

  private summary(preview: PreviewRow[]) {
    return {
      total: preview.length,
      ok: preview.filter((p) => p.status === 'ok').length,
      duplicates: preview.filter((p) => p.status === 'duplicate').length,
      errors: preview.filter((p) => p.status === 'error').length,
    };
  }

  /** Dry-run: valida y devuelve el detalle por fila + resumen, SIN escribir nada. */
  async previewClients(user: RequestUser, csv: string) {
    const { preview } = await this.build(user, csv);
    return { summary: this.summary(preview), rows: preview };
  }

  /** Crea los clientes válidos no duplicados. Idempotente (re-importar omite los ya existentes). */
  async commitClients(user: RequestUser, csv: string) {
    const { preview, toCreate } = await this.build(user, csv);
    let created = 0;
    const failed: { line: number; message: string }[] = [];
    for (const { row, kind, normalized } of toCreate) {
      try {
        await this.prisma.client.create({
          data: {
            tenantId: user.tenantId,
            name: row.name,
            taxId: normalized,
            taxIdKind: kind,
            email: row.email || null,
            phone: row.phone || null,
            address: row.address || null,
          },
        });
        created += 1;
      } catch (e) {
        failed.push({ line: row.line, message: (e as Error).message.slice(0, 120) });
      }
    }
    const s = this.summary(preview);
    await this.audit.log(user, 'clients.imported', 'Client', 'bulk', {
      created,
      skippedDuplicates: s.duplicates,
      errors: s.errors + failed.length,
    });
    return { created, skippedDuplicates: s.duplicates, errors: s.errors, failed };
  }
}
