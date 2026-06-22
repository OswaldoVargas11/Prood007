'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Cloud,
  Download,
  FileDiff,
  FileText,
  LayoutTemplate,
  Loader2,
  Plus,
  Upload,
} from 'lucide-react';
import {
  downloadVersion,
  useAddDocumentVersion,
  useCompareVersions,
  useGenerateFromTemplate,
  useMatterDocuments,
  useReviewVersion,
  useTemplates,
  useUploadDocument,
} from '@/lib/hooks';
import { docStatusVariant, formatBytes, REVIEW_ACTIONS } from '@/lib/doc-status';
import { formatDateTime } from '@/lib/format';
import { SignaturePanel } from '@/components/lexora/signature-panel';
import { CloudImportDialog } from '@/components/lexora/cloud-import-dialog';
import type { DocumentReviewStatus, DocumentVersion, MatterDocument } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function ReviewBadge({ status }: { status: DocumentReviewStatus }) {
  const t = useTranslations('documents.status');
  return <Badge variant={docStatusVariant(status)}>{t(status)}</Badge>;
}

export function DocumentsTab({ matterId }: { matterId: string }) {
  const t = useTranslations('documents');
  const locale = useLocale();
  const { data, isLoading, isError, refetch } = useMatterDocuments(matterId);
  const upload = useUploadDocument(matterId);
  const addVersion = useAddDocumentVersion(matterId);
  const newFileRef = useRef<HTMLInputElement>(null);
  const versionFileRef = useRef<HTMLInputElement>(null);
  const [versionFor, setVersionFor] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<DocumentVersion | null>(null);
  const [comparing, setComparing] = useState<MatterDocument | null>(null);
  const [generating, setGenerating] = useState(false);
  const [importingCloud, setImportingCloud] = useState(false);

  function onNewFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload.mutate({ file, name: file.name });
    e.target.value = '';
  }
  function onVersionFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && versionFor) addVersion.mutate({ documentId: versionFor, file });
    e.target.value = '';
    setVersionFor(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setGenerating(true)}>
            <LayoutTemplate />
            {t('fromTemplate')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportingCloud(true)}>
            <Cloud />
            {t('cloud.button')}
          </Button>
          <Button size="sm" onClick={() => newFileRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            {t('upload')}
          </Button>
        </div>
        <input ref={newFileRef} type="file" className="hidden" onChange={onNewFile} />
        <input ref={versionFileRef} type="file" className="hidden" onChange={onVersionFile} />
      </div>

      {upload.isError && <p className="text-sm text-[var(--danger)]">{t('uploadError')}</p>}

      {isLoading && <Skeleton className="h-32 w-full" />}
      {isError && (
        <div className="space-y-2 py-8 text-center">
          <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {t('retry')}
          </Button>
        </div>
      )}
      {!isLoading && !isError && data?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('empty')}
          </CardContent>
        </Card>
      )}

      {!isLoading &&
        !isError &&
        data?.map((doc: MatterDocument) => {
          const latest = doc.versions[0];
          return (
            <Card key={doc.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-[var(--brand)]" />
                  <span className="font-medium">{doc.name}</span>
                  {latest && <ReviewBadge status={latest.reviewStatus} />}
                  <div className="ml-auto flex gap-2">
                    {doc.versions.length >= 2 && (
                      <Button size="sm" variant="outline" onClick={() => setComparing(doc)}>
                        <FileDiff />
                        {t('compare')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setVersionFor(doc.id);
                        versionFileRef.current?.click();
                      }}
                      disabled={addVersion.isPending}
                    >
                      <Plus />
                      {t('newVersion')}
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-border rounded-md border border-border">
                  {doc.versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">v{v.version}</span>
                      <ReviewBadge status={v.reviewStatus} />
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(v.sizeBytes)}
                      </span>
                      {v.uploadedBy?.fullName && (
                        <span className="hidden text-xs text-muted-foreground md:inline">
                          {v.uploadedBy.fullName}
                        </span>
                      )}
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {formatDateTime(v.createdAt, locale)}
                      </span>
                      <div className="ml-auto flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => downloadVersion(v.id, `${doc.name}-v${v.version}`)}
                        >
                          <Download />
                          {t('download')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setReviewing(v)}>
                          {t('review')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {latest && <SignaturePanel documentId={doc.id} latestVersionId={latest.id} />}
              </CardContent>
            </Card>
          );
        })}

      <ReviewDialog matterId={matterId} version={reviewing} onClose={() => setReviewing(null)} />
      <CompareDialog document={comparing} onClose={() => setComparing(null)} />
      <GenerateDialog matterId={matterId} open={generating} onClose={() => setGenerating(false)} />
      <CloudImportDialog
        matterId={matterId}
        open={importingCloud}
        onClose={() => setImportingCloud(false)}
      />
    </div>
  );
}

/** Diálogo para generar un documento a partir de una plantilla del despacho. */
function GenerateDialog({
  matterId,
  open,
  onClose,
}: {
  matterId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('documents');
  const { data: templates, isLoading } = useTemplates();
  const generate = useGenerateFromTemplate(matterId);
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await generate.mutateAsync({ templateId, name: name.trim() || undefined });
      setTemplateId('');
      setName('');
      onClose();
    } catch {
      setError(t('generateError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('generateTitle')}</DialogTitle>
          <DialogDescription>{t('generateSubtitle')}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : templates && templates.length > 0 ? (
          <div className="space-y-3">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t('chooseTemplate')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('docNameOptional')}
              className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('noTemplates')}</p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={submit} disabled={!templateId || generate.isPending}>
            {generate.isPending && <Loader2 className="animate-spin" />}
            {t('generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  matterId,
  version,
  onClose,
}: {
  matterId: string;
  version: DocumentVersion | null;
  onClose: () => void;
}) {
  const t = useTranslations('documents');
  const tStatus = useTranslations('documents.status');
  const review = useReviewVersion(matterId);
  const [comment, setComment] = useState('');

  function submit(status: DocumentReviewStatus) {
    if (!version) return;
    review.mutate(
      { versionId: version.id, status, comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          setComment('');
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open={Boolean(version)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('reviewTitle')}</DialogTitle>
          <DialogDescription>{t('reviewSubtitle')}</DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder={t('commentPlaceholder')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {review.isError && <p className="text-sm text-[var(--danger)]">{t('reviewError')}</p>}
        <DialogFooter className="flex-wrap gap-2">
          {REVIEW_ACTIONS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              disabled={review.isPending}
              onClick={() => submit(s)}
            >
              {tStatus(s)}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const compareSelectClass =
  'flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function CompareDialog({
  document: doc,
  onClose,
}: {
  document: MatterDocument | null;
  onClose: () => void;
}) {
  const t = useTranslations('documents');
  // versions vienen ordenadas desc (más reciente primero). Por defecto: anterior → última.
  const versions = doc?.versions ?? [];
  const [base, setBase] = useState<string | null>(null);
  const [against, setAgainst] = useState<string | null>(null);

  const effectiveBase = base ?? versions[1]?.id ?? null;
  const effectiveAgainst = against ?? versions[0]?.id ?? null;

  const compare = useCompareVersions(doc?.id ?? '', effectiveBase, effectiveAgainst);

  return (
    <Dialog
      open={Boolean(doc)}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setBase(null);
          setAgainst(null);
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('compareTitle')}</DialogTitle>
          <DialogDescription>{t('compareSubtitle')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">{t('compareBase')}</span>
            <select
              value={effectiveBase ?? ''}
              onChange={(e) => setBase(e.target.value)}
              className={compareSelectClass}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">{t('compareAgainst')}</span>
            <select
              value={effectiveAgainst ?? ''}
              onChange={(e) => setAgainst(e.target.value)}
              className={compareSelectClass}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border bg-[var(--surface-1)] p-3 text-sm">
          {compare.isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t('compareLoading')}
            </div>
          )}
          {compare.isError && <p className="text-[var(--danger)]">{t('compareError')}</p>}
          {compare.data && !compare.data.extractable && (
            <p className="text-muted-foreground">{t('compareNotExtractable')}</p>
          )}
          {compare.data && compare.data.extractable && (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                {t('compareStats', { added: compare.data.added, removed: compare.data.removed })}
              </p>
              <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">
                {compare.data.segments.map((seg, i) => {
                  if (seg.type === 'insert') {
                    return (
                      <ins
                        key={i}
                        className="bg-[color-mix(in_srgb,var(--success)_18%,transparent)] text-[var(--success)] no-underline"
                      >
                        {seg.value}
                      </ins>
                    );
                  }
                  if (seg.type === 'delete') {
                    return (
                      <del
                        key={i}
                        className="bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]"
                      >
                        {seg.value}
                      </del>
                    );
                  }
                  return <span key={i}>{seg.value}</span>;
                })}
              </pre>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
