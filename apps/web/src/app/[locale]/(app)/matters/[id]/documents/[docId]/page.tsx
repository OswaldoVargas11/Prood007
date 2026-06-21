'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { downloadVersion, useDocument, useReviewVersion } from '@/lib/hooks';
import { docStatusVariant, formatBytes, mimeLabel } from '@/lib/doc-status';
import { formatDate, formatDateTime } from '@/lib/format';
import { relativeTime } from '@/lib/activity';
import { AiDocumentSummary } from '@/components/lexora/ai-document-summary';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DocumentReviewStatus, DocumentVersionDetail } from '@/lib/types';

type TimelineItem = {
  id: string;
  kind: 'upload' | 'review';
  status?: DocumentReviewStatus;
  comment?: string | null;
  version: number;
  createdAt: string;
};

export default function DocumentReviewPage() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const t = useTranslations('documents');
  const tStatus = useTranslations('documents.status');
  const locale = useLocale();

  const { data: doc, isLoading, isError, refetch } = useDocument(docId);
  const review = useReviewVersion(id);
  const [comment, setComment] = useState('');
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const versions = useMemo(() => doc?.versions ?? [], [doc]);

  // Por defecto: derecha = última versión, izquierda = anterior (o la misma si solo hay una).
  useEffect(() => {
    if (versions.length === 0) return;
    setRightId((r) => r ?? versions[0].id);
    setLeftId((l) => l ?? versions[1]?.id ?? versions[0].id);
  }, [versions]);

  const left = versions.find((v) => v.id === leftId) ?? null;
  const right = versions.find((v) => v.id === rightId) ?? versions[0] ?? null;

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const v of versions) {
      items.push({
        id: `up-${v.id}`,
        kind: 'upload',
        version: v.version,
        createdAt: v.createdAt,
      });
      for (const r of v.reviews) {
        items.push({
          id: r.id,
          kind: 'review',
          status: r.status,
          comment: r.comment,
          version: v.version,
          createdAt: r.createdAt,
        });
      }
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [versions]);

  function submit(status: DocumentReviewStatus) {
    if (!right) return;
    review.mutate(
      { versionId: right.id, status, comment: comment.trim() || undefined },
      { onSuccess: () => setComment('') },
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1320px] space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !doc || !right) {
    return (
      <div className="mx-auto max-w-[1320px] space-y-3 py-12 text-center">
        <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm font-medium text-[var(--brand)] hover:underline"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <Link
        href={`/matters/${id}/documents`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        ‹ {t('title')}
      </Link>

      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-[var(--danger-soft)] font-mono text-[9px] font-bold text-[var(--danger)]">
          {mimeLabel(right.mimeType)}
        </span>
        <div>
          <div className="text-[17px] font-semibold tracking-tight">{doc.name}</div>
          <div className="text-xs text-[var(--text-subtle)]">
            {left && right && left.id !== right.id
              ? t('comparing', { a: left.version, b: right.version })
              : t('viewing', { v: right.version })}
          </div>
        </div>
        <Badge variant={docStatusVariant(right.reviewStatus)} className="ml-auto">
          {tStatus(right.reviewStatus)}
        </Badge>
      </div>

      <AiDocumentSummary documentId={docId} />

      {/* Selector de versiones a comparar */}
      {versions.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <VersionSelect
            label={t('versionOld')}
            versions={versions}
            value={left?.id ?? ''}
            onChange={setLeftId}
          />
          <span className="text-[var(--text-subtle)]">→</span>
          <VersionSelect
            label={t('versionNew')}
            versions={versions}
            value={right.id}
            onChange={setRightId}
          />
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        {/* Comparación lado a lado */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {left && (
            <VersionPanel
              doc={doc.name}
              version={left}
              locale={locale}
              highlight={false}
              t={t}
              tStatus={tStatus}
              latestId={versions[0].id}
            />
          )}
          <VersionPanel
            doc={doc.name}
            version={right}
            locale={locale}
            highlight
            t={t}
            tStatus={tStatus}
            latestId={versions[0].id}
          />
        </div>

        {/* Rail: acciones de revisión + cronología */}
        <div className="flex flex-col gap-3.5 lg:sticky lg:top-2">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 text-[12.5px] font-semibold">
              {t('reviewVersion', { v: right.version })}
            </div>
            <Textarea
              placeholder={t('commentPlaceholder')}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="h-[74px] resize-none"
            />
            {review.isError && (
              <p className="mt-2 text-xs text-[var(--danger)]">{t('reviewError')}</p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                disabled={review.isPending}
                onClick={() => submit('APPROVED')}
                className="w-full rounded-[10px] bg-[var(--success)] px-3 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {tStatus('APPROVED')}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => submit('CHANGES_REQUESTED')}
                  className="flex-1 rounded-[10px] border border-[var(--violet)] bg-[var(--violet-soft)] px-3 py-2 text-[12.5px] font-semibold text-[var(--violet)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {tStatus('CHANGES_REQUESTED')}
                </button>
                <button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => submit('REJECTED')}
                  className="flex-1 rounded-[10px] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[12.5px] font-semibold text-[var(--danger)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {tStatus('REJECTED')}
                </button>
              </div>
              <button
                type="button"
                disabled={review.isPending}
                onClick={() => submit('IN_REVIEW')}
                className="w-full rounded-[10px] border px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {tStatus('IN_REVIEW')}
              </button>
            </div>
            <div className="mt-3 text-[11px] text-[var(--text-subtle)]">{t('notifyOnResolve')}</div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 text-[12.5px] font-semibold">{t('reviewTimeline')}</div>
            <div className="flex flex-col gap-3">
              {timeline.map((it) => (
                <div key={it.id} className="flex gap-2.5">
                  <span
                    className="mt-1 size-2 flex-shrink-0 rounded-full"
                    style={{
                      background:
                        it.kind === 'upload'
                          ? 'var(--brand)'
                          : it.status === 'APPROVED'
                            ? 'var(--success)'
                            : it.status === 'REJECTED'
                              ? 'var(--danger)'
                              : 'var(--violet)',
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-[12px]">
                      {it.kind === 'upload'
                        ? t('timelineUpload', { v: it.version })
                        : t('timelineReview', { status: tStatus(it.status!), v: it.version })}
                    </div>
                    {it.comment && (
                      <div className="mt-0.5 text-[11px] italic text-muted-foreground">
                        “{it.comment}”
                      </div>
                    )}
                    <div className="text-[10.5px] text-[var(--text-subtle)]">
                      {relativeTime(it.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VersionSelect({
  label,
  versions,
  value,
  onChange,
}: {
  label: string;
  versions: DocumentVersionDetail[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-[var(--text-subtle)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border bg-[var(--surface-1)] px-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version}
          </option>
        ))}
      </select>
    </label>
  );
}

function VersionPanel({
  doc,
  version,
  locale,
  highlight,
  latestId,
  t,
  tStatus,
}: {
  doc: string;
  version: DocumentVersionDetail;
  locale: string;
  highlight: boolean;
  latestId: string;
  t: ReturnType<typeof useTranslations>;
  tStatus: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-sm',
        highlight && 'border-[var(--brand-line)]',
      )}
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="font-mono text-xs font-semibold">v{version.version}</span>
        <span className="text-[11px] text-[var(--text-subtle)]">
          {formatDate(version.createdAt, locale)}
        </span>
        {version.id === latestId && (
          <span className="ml-auto rounded-[5px] bg-[var(--brand-soft)] px-1.5 py-px text-[9.5px] font-semibold text-[var(--brand)]">
            {t('current')}
          </span>
        )}
      </div>
      <div
        className="m-4 flex aspect-[1/1.15] items-center justify-center rounded-[10px] border"
        style={{
          background:
            'repeating-linear-gradient(135deg,var(--surface-1),var(--surface-1) 11px,var(--card) 11px,var(--card) 22px)',
        }}
      >
        <span className="font-mono text-[11px] text-[var(--text-subtle)]">
          {doc} · v{version.version}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4 text-[12px]">
        <div className="flex justify-between">
          <span className="text-[var(--text-subtle)]">{t('typeLabel')}</span>
          <span>
            {mimeLabel(version.mimeType)} · {formatBytes(version.sizeBytes)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-subtle)]">{t('statusLabel')}</span>
          <Badge variant={docStatusVariant(version.reviewStatus)}>
            {tStatus(version.reviewStatus)}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-subtle)]">{t('uploadedAt')}</span>
          <span>{formatDateTime(version.createdAt, locale)}</span>
        </div>
        <button
          type="button"
          onClick={() => downloadVersion(version.id, `${doc}-v${version.version}`)}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Download className="size-3.5" />
          {t('download')}
        </button>
      </div>
    </div>
  );
}
