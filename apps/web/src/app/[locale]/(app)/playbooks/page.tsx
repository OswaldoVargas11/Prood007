'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookOpenCheck, Pencil, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import {
  useAiStatus,
  useCreatePlaybook,
  useCreatePlaybookReview,
  useDeletePlaybook,
  useInstallPlaybookSeed,
  useMatterDocuments,
  useMatters,
  usePlaybook,
  usePlaybookReviews,
  usePlaybooks,
  useUpdatePlaybook,
  type PlaybookRuleInput,
} from '@/lib/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/lexora/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { PlaybookSummary } from '@/lib/types';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * Playbooks de revisión de contratos: las posiciones del despacho por tema (preferida / aceptables /
 * deal-breakers + severidad). Desde aquí se editan y se lanza la revisión de un contrato del expediente
 * contra un playbook; el informe (con citas verificadas) se abre en su propia página y se exporta a PDF.
 */
export default function PlaybooksPage() {
  const t = useTranslations('playbooks');
  const router = useRouter();

  const { data: aiStatus } = useAiStatus();
  const { data: playbooks, isLoading } = usePlaybooks();
  const { data: reviews } = usePlaybookReviews();
  const installSeed = useInstallPlaybookSeed();
  const deletePlaybook = useDeletePlaybook();

  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const aiEnabled = Boolean(aiStatus?.enabled);

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          aiEnabled ? (
            <div className="flex items-center gap-2">
              {(playbooks?.length ?? 0) > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => installSeed.mutate()}
                  disabled={installSeed.isPending}
                >
                  <Sparkles className="mr-1.5 size-3.5" /> {t('installSeed')}
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus className="mr-1.5 size-4" /> {t('new')}
              </Button>
            </div>
          ) : undefined
        }
      />

      {!aiEnabled ? (
        <Card>
          <EmptyState
            icon={BookOpenCheck}
            title={t('aiDisabledTitle')}
            description={t('aiDisabled')}
          />
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (playbooks?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpenCheck}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => installSeed.mutate()}
                  disabled={installSeed.isPending}
                >
                  <Sparkles className="mr-1.5 size-3.5" /> {t('installSeed')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
                  <Plus className="mr-1.5 size-4" /> {t('new')}
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {playbooks!.map((p) => (
            <PlaybookRow
              key={p.id}
              playbook={p}
              onRun={() => setRunning(p.id)}
              onEdit={() => setEditing(p.id)}
              onDelete={() => setDeleting(p.id)}
            />
          ))}
        </div>
      )}

      {aiEnabled && (
        <section className="space-y-2">
          <h2 className="text-[15px] font-semibold tracking-tight">{t('reviewsTitle')}</h2>
          {(reviews?.length ?? 0) === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t('reviewsEmpty')}</p>
          ) : (
            reviews!.map((r) => {
              const total = r.progress.pending + r.progress.done + r.progress.failed;
              return (
                <Card
                  key={r.id}
                  interactive
                  className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3"
                  onClick={() => router.push(`/playbooks/reviews/${r.id}`)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{r.documentName}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                      {r.playbookName}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.progress.pending > 0 ? (
                      <Badge variant="outline">
                        {t('progressPending', { done: r.progress.done, total })}
                      </Badge>
                    ) : r.progress.failed > 0 ? (
                      <Badge variant="outline" className="text-red-600">
                        {t('progressFailed', { failed: r.progress.failed })}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-emerald-600">
                        {t('progressDone')}
                      </Badge>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </section>
      )}

      {editing && (
        <PlaybookEditorDialog
          playbookId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {running && (
        <RunReviewDialog
          playbookId={running}
          onClose={() => setRunning(null)}
          onCreated={(reviewId) => {
            setRunning(null);
            router.push(`/playbooks/reviews/${reviewId}`);
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('delete')}
        description={t('deleteConfirm')}
        confirmLabel={t('delete')}
        onConfirm={() => {
          if (deleting) deletePlaybook.mutate(deleting);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function PlaybookRow({
  playbook,
  onRun,
  onEdit,
  onDelete,
}: {
  playbook: PlaybookSummary;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('playbooks');
  return (
    <Card className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium">{playbook.name}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {t('rules', { count: playbook.ruleCount })}
          <span className="mx-1.5">·</span>
          {playbook.jurisdiction ? playbook.jurisdiction.toUpperCase() : t('jurisdictionAny')}
          {playbook.description && (
            <>
              <span className="mx-1.5">·</span>
              <span className="truncate">{playbook.description}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" onClick={onRun}>
          <Play className="mr-1.5 size-3.5" /> {t('runReview')}
        </Button>
        <Button size="sm" variant="outline" aria-label={t('edit')} onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button size="sm" variant="outline" aria-label={t('delete')} onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </Card>
  );
}

interface RuleDraft {
  topic: string;
  preferredText: string;
  acceptableText: string;
  dealBreakers: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

const EMPTY_RULE: RuleDraft = {
  topic: '',
  preferredText: '',
  acceptableText: '',
  dealBreakers: '',
  severity: 'MEDIUM',
};

/** Alta/edición de un playbook: nombre + juego completo de reglas (al guardar, se reemplazan). */
function PlaybookEditorDialog({
  playbookId,
  onClose,
}: {
  playbookId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('playbooks');
  const { data: existing } = usePlaybook(playbookId ?? '');
  const create = useCreatePlaybook();
  const update = useUpdatePlaybook();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<RuleDraft[]>([{ ...EMPTY_RULE }]);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Carga diferida del playbook a editar (una sola vez por id).
  useEffect(() => {
    if (!existing || existing.id === loadedId) return;
    setLoadedId(existing.id);
    setName(existing.name);
    setDescription(existing.description ?? '');
    setRules(
      existing.rules.map((r) => ({
        topic: r.topic,
        preferredText: r.preferredText ?? '',
        acceptableText: r.acceptableText ?? '',
        dealBreakers: r.dealBreakers ?? '',
        severity: r.severity,
      })),
    );
  }, [existing, loadedId]);

  const pending = create.isPending || update.isPending;
  const canSubmit =
    name.trim().length >= 2 &&
    rules.length > 0 &&
    rules.every((r) => r.topic.trim().length >= 2) &&
    !pending;

  function patchRule(i: number, patch: Partial<RuleDraft>) {
    setRules((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function submit() {
    if (!canSubmit) return;
    const payloadRules: PlaybookRuleInput[] = rules.map((r) => ({
      topic: r.topic.trim(),
      preferredText: r.preferredText.trim() || undefined,
      acceptableText: r.acceptableText.trim() || undefined,
      dealBreakers: r.dealBreakers.trim() || undefined,
      severity: r.severity,
    }));
    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      rules: payloadRules,
    };
    if (playbookId) {
      update.mutate({ id: playbookId, ...body }, { onSuccess: onClose });
    } else {
      create.mutate(body, { onSuccess: onClose });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{playbookId ? t('editorTitleEdit') : t('editorTitleNew')}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-[12.5px] font-medium">{t('nameLabel')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={160}
            />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium">{t('descriptionLabel')}</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              maxLength={500}
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-medium">{t('rulesLabel')}</label>
            <p className="mb-2 text-[12px] text-muted-foreground">{t('rulesHint')}</p>
            <div className="space-y-3">
              {rules.map((rule, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      value={rule.topic}
                      onChange={(e) => patchRule(i, { topic: e.target.value })}
                      placeholder={t('topicPlaceholder')}
                      maxLength={200}
                      aria-label={t('topicLabel')}
                    />
                    <select
                      value={rule.severity}
                      onChange={(e) =>
                        patchRule(i, { severity: e.target.value as RuleDraft['severity'] })
                      }
                      className={`${SELECT_CLASS} w-32 shrink-0`}
                      aria-label={t('severityLabel')}
                    >
                      <option value="LOW">{t('severity.LOW')}</option>
                      <option value="MEDIUM">{t('severity.MEDIUM')}</option>
                      <option value="HIGH">{t('severity.HIGH')}</option>
                    </select>
                    {rules.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={t('removeRule')}
                        className="shrink-0"
                        onClick={() => setRules((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] text-muted-foreground">
                      {t('preferredLabel')}
                    </label>
                    <Textarea
                      value={rule.preferredText}
                      onChange={(e) => patchRule(i, { preferredText: e.target.value })}
                      placeholder={t('preferredPlaceholder')}
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[12px] text-muted-foreground">
                        {t('acceptableLabel')}
                      </label>
                      <Textarea
                        value={rule.acceptableText}
                        onChange={(e) => patchRule(i, { acceptableText: e.target.value })}
                        placeholder={t('acceptablePlaceholder')}
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] text-muted-foreground">
                        {t('dealBreakersLabel')}
                      </label>
                      <Textarea
                        value={rule.dealBreakers}
                        onChange={(e) => patchRule(i, { dealBreakers: e.target.value })}
                        placeholder={t('dealBreakersPlaceholder')}
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {rules.length < 25 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setRules((prev) => [...prev, { ...EMPTY_RULE }])}
              >
                <Plus className="mr-1.5 size-3.5" /> {t('addRule')}
              </Button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
        {(create.isError || update.isError) && (
          <p className="text-[12.5px] text-red-600">{t('saveError')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Lanzar una revisión: expediente → documento → revisar (el informe se abre al crearla). */
function RunReviewDialog({
  playbookId,
  onClose,
  onCreated,
}: {
  playbookId: string;
  onClose: () => void;
  onCreated: (reviewId: string) => void;
}) {
  const t = useTranslations('playbooks');
  const create = useCreatePlaybookReview();

  const [matterId, setMatterId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const { data: matters } = useMatters({ pageSize: 50 });
  const { data: docs } = useMatterDocuments(matterId);

  const canSubmit = Boolean(matterId && documentId) && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    create.mutate({ playbookId, documentId }, { onSuccess: (review) => onCreated(review.id) });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('runTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-[12.5px] text-muted-foreground">{t('runHint')}</p>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium">{t('matterLabel')}</label>
            <select
              value={matterId}
              onChange={(e) => {
                setMatterId(e.target.value);
                setDocumentId('');
              }}
              className={SELECT_CLASS}
            >
              <option value="">{t('pickMatter')}</option>
              {(matters?.items ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.reference} — {m.title}
                </option>
              ))}
            </select>
          </div>
          {matterId && (
            <div>
              <label className="mb-1 block text-[12.5px] font-medium">{t('documentLabel')}</label>
              {(docs ?? []).length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">{t('noDocuments')}</p>
              ) : (
                <select
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">{t('pickDocument')}</option>
                  {(docs ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {create.isPending ? t('running') : t('run')}
            </Button>
          </div>
          {create.isError && <p className="text-[12.5px] text-red-600">{t('runError')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
