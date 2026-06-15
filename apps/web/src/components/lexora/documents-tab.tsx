'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, FileText, Loader2, Plus, Upload } from 'lucide-react';
import {
  downloadVersion,
  useAddDocumentVersion,
  useMatterDocuments,
  useReviewVersion,
  useUploadDocument,
} from '@/lib/hooks';
import { docStatusVariant, formatBytes, REVIEW_ACTIONS } from '@/lib/doc-status';
import { formatDateTime } from '@/lib/format';
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
        <Button size="sm" onClick={() => newFileRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          {t('upload')}
        </Button>
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
              </CardContent>
            </Card>
          );
        })}

      <ReviewDialog matterId={matterId} version={reviewing} onClose={() => setReviewing(null)} />
    </div>
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
