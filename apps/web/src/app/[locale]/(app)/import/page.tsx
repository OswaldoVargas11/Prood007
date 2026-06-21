'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileUp, Loader2, Upload } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useImportClientsCommit, useImportClientsPreview } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';
import type { ImportPreview } from '@/lib/types';

const SAMPLE_CSV =
  'nombre,documento,tipo,email,telefono,direccion\n' +
  'María López García,12345678Z,,maria@correo.test,+34 600111222,"C/ Mayor 1, Madrid"\n' +
  'Construcciones Delta S.L.,B12345674,,info@delta.test,+34 910000000,"Av. de la Industria 5, Madrid"\n' +
  'José Peña Reyes,00112345673,,jose@correo.do,+1 8095551234,"Av. Lincoln 10, Santo Domingo"\n' +
  'Inmobiliaria Caribe SRL,130000010,,info@caribe.do,+1 8095559876,"C/ El Conde 3, Santo Domingo"\n' +
  'Cliente Extranjero,AB1234567,PASSPORT,extranjero@correo.test,,\n';

function statusVariant(s: string): NonNullable<BadgeProps['variant']> {
  return s === 'ok' ? 'success' : s === 'duplicate' ? 'warning' : 'danger';
}

export default function ImportPage() {
  const t = useTranslations('import');
  const { hasRole } = useAuth();
  const preview = useImportClientsPreview();
  const commit = useImportClientsCommit();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportPreview | null>(null);

  if (!hasRole('FIRM_ADMIN')) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center text-sm text-muted-foreground">
        {t('notAuthorized')}
      </div>
    );
  }

  async function onFile(file: File) {
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setResult(null);
  }

  async function doPreview() {
    setResult(null);
    const r = await preview.mutateAsync(csv);
    setResult(r);
  }

  async function doCommit() {
    const r = await commit.mutateAsync(csv);
    toast.success(t('imported', { n: r.created }));
    // Refrescar el preview (los importados pasarán a "duplicado").
    setResult(await preview.mutateAsync(csv).catch(() => null));
  }

  function downloadTemplate() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-clientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const s = result?.summary;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">{t('step1')}</div>
              <p className="text-[12.5px] text-muted-foreground">{t('formatHint')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download /> {t('downloadTemplate')}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp /> {t('chooseFile')}
            </Button>
            {fileName && <span className="text-[12.5px] text-muted-foreground">{fileName}</span>}
          </div>

          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setResult(null);
            }}
            rows={6}
            placeholder={t('pastePlaceholder')}
            className="w-full rounded-md border bg-[var(--surface-1)] p-3 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={doPreview} disabled={!csv.trim() || preview.isPending}>
              {preview.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              {t('preview')}
            </Button>
            {preview.isError && (
              <span className="text-[12.5px] text-[var(--danger)]">{t('previewError')}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {result && s && (
        <Card>
          <CardContent className="space-y-4 p-5">
            {/* Resumen */}
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <Badge variant="success">{t('okCount', { n: s.ok })}</Badge>
              <Badge variant="warning">{t('dupCount', { n: s.duplicates })}</Badge>
              <Badge variant="danger">{t('errCount', { n: s.errors })}</Badge>
              <span className="text-muted-foreground">{t('totalCount', { n: s.total })}</span>
            </div>

            {/* Tabla de filas */}
            <div className="max-h-[420px] overflow-auto rounded-lg border">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-[10.5px] uppercase tracking-wide text-[var(--text-subtle)]">
                    <th scope="col" className="px-3 py-2">
                      {t('colLine')}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t('colName')}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t('colDoc')}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t('colStatus')}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t('colDetail')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.rows.map((r) => (
                    <tr key={r.line}>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.line}</td>
                      <td className="px-3 py-1.5">{r.name || '—'}</td>
                      <td className="px-3 py-1.5 font-mono text-[11px]">
                        {r.taxId}
                        {r.kind && (
                          <span className="ml-1 text-[var(--text-subtle)]">· {r.kind}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant={statusVariant(r.status)}>{t(`status.${r.status}`)}</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.message ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Confirmar */}
            <div className="flex items-center justify-end gap-3">
              {s.ok === 0 && (
                <span className="text-[12.5px] text-muted-foreground">{t('nothingToImport')}</span>
              )}
              <Button onClick={doCommit} disabled={s.ok === 0 || commit.isPending}>
                {commit.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                {t('importN', { n: s.ok })}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
