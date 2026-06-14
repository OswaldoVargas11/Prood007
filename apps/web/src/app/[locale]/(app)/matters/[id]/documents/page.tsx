'use client';

import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Download, Loader2, Upload } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { downloadVersion, useMatter, useMatterDocuments, useUploadDocument } from '@/lib/hooks';
import { docStatusVariant, formatBytes, mimeLabel } from '@/lib/doc-status';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { MatterDocument } from '@/lib/types';

export default function MatterDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('documents');
  const tStatus = useTranslations('documents.status');
  const locale = useLocale();
  const router = useRouter();

  const matter = useMatter(id);
  const { data, isLoading, isError, refetch } = useMatterDocuments(id);
  const upload = useUploadDocument(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo<MatterDocument | null>(
    () => data?.find((d) => d.id === selectedId) ?? data?.[0] ?? null,
    [data, selectedId],
  );

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload.mutate({ file, name: file.name });
    e.target.value = '';
  }

  const latest = selected?.versions[0];

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <div>
        <Link
          href={`/matters/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {matter.data?.reference ?? t('back')}
        </Link>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">{t('groupedSubtitle')}</p>
          </div>
        </div>
      </div>

      {/* Dropzone (clic para seleccionar; subida real) */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
        className="flex w-full items-center justify-center gap-3 rounded-xl border-[1.5px] border-dashed bg-card p-[18px] text-muted-foreground transition-colors hover:border-[var(--brand-line)] hover:text-foreground disabled:opacity-60"
      >
        {upload.isPending ? (
          <Loader2 className="size-[18px] animate-spin" />
        ) : (
          <Upload className="size-[18px]" />
        )}
        <span className="text-[13px] font-medium">{t('dropzone')}</span>
      </button>
      <input ref={fileRef} type="file" className="hidden" onChange={onFile} />
      {upload.isError && <p className="text-sm text-[var(--danger)]">{t('uploadError')}</p>}

      {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 text-sm font-medium text-[var(--brand)] hover:underline"
          >
            {t('retry')}
          </button>
        </div>
      )}
      {!isLoading && !isError && data?.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* Lista agrupada por documento */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {data.map((doc) => {
              const top = doc.versions[0];
              const active = selected?.id === doc.id;
              return (
                <div key={doc.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(doc.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60',
                      active && 'bg-[var(--brand-soft)]',
                    )}
                  >
                    <span className="flex size-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-[var(--danger-soft)] font-mono text-[9px] font-bold text-[var(--danger)]">
                      {top ? mimeLabel(top.mimeType) : '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{doc.name}</div>
                      <div className="text-[11px] text-[var(--text-subtle)]">
                        {top ? formatBytes(top.sizeBytes) : ''}
                      </div>
                    </div>
                    {top && (
                      <Badge variant={docStatusVariant(top.reviewStatus)}>
                        {tStatus(top.reviewStatus)}
                      </Badge>
                    )}
                  </button>
                  <div className="flex flex-col gap-1.5 px-4 pb-2.5 pl-[63px]">
                    {doc.versions.map((v, i) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-2.5 text-[11.5px] text-[var(--text-subtle)]"
                      >
                        <span className="w-6 font-mono font-semibold text-muted-foreground">
                          v{v.version}
                        </span>
                        <span>{formatDate(v.createdAt, locale)}</span>
                        {i === 0 && (
                          <span className="rounded-[5px] bg-[var(--brand-soft)] px-1.5 py-px text-[9.5px] font-semibold text-[var(--brand)]">
                            {t('current')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rail de vista previa */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm lg:sticky lg:top-2">
            <div className="border-b px-4 py-3 text-[13px] font-semibold">{t('preview')}</div>
            <div
              className="m-4 flex aspect-[1/1.1] items-center justify-center rounded-[10px] border"
              style={{
                background:
                  'repeating-linear-gradient(135deg,var(--surface-1),var(--surface-1) 11px,var(--card) 11px,var(--card) 22px)',
              }}
            >
              <span className="font-mono text-[11px] text-[var(--text-subtle)]">
                {selected && latest ? `${selected.name} · v${latest.version}` : '—'}
              </span>
            </div>
            {selected && latest && (
              <div className="flex flex-col gap-2 px-4 pb-4 text-[12px]">
                <Row
                  label={t('typeLabel')}
                  value={`${mimeLabel(latest.mimeType)} · ${formatBytes(latest.sizeBytes)}`}
                />
                <div className="flex justify-between">
                  <span className="text-[var(--text-subtle)]">{t('statusLabel')}</span>
                  <Badge variant={docStatusVariant(latest.reviewStatus)}>
                    {tStatus(latest.reviewStatus)}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/matters/${id}/documents/${selected.id}`)}
                  className="mt-1.5 rounded-[9px] bg-[var(--brand)] px-3 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  {t('reviewDoc')} →
                </button>
                <button
                  type="button"
                  onClick={() => downloadVersion(latest.id, `${selected.name}-v${latest.version}`)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Download className="size-3.5" />
                  {t('download')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-subtle)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
