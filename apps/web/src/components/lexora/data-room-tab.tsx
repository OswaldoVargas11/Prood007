'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Check,
  Copy,
  Download,
  FileText,
  FolderPlus,
  Link2,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  downloadDataRoomDoc,
  useAnswerDataRoomQuestion,
  useCreateDataRoom,
  useDataRoom,
  useDataRoomAccessLog,
  useDataRoomActions,
  useDataRoomQuestions,
  useDeleteDataRoom,
  useMatterDataRooms,
  useMatterDocuments,
} from '@/lib/hooks';
import { formatBytes } from '@/lib/doc-status';
import { formatDateTime } from '@/lib/format';
import type { DataRoomDetail } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const selectClass =
  'flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function DataRoomTab({ matterId }: { matterId: string }) {
  const t = useTranslations('dataRoom');
  const { data: rooms, isLoading } = useMatterDataRooms(matterId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && rooms && rooms.length > 0) setSelectedId(rooms[0].id);
  }, [rooms, selectedId]);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {rooms?.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                selectedId === r.id
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.name} <span className="opacity-70">· {r._count.documents} doc.</span>
            </button>
          ))}
        </div>
        <NewRoomButton matterId={matterId} onCreated={setSelectedId} />
      </div>

      {!rooms?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('empty')}
          </CardContent>
        </Card>
      ) : selectedId ? (
        <RoomManager
          matterId={matterId}
          roomId={selectedId}
          onDeleted={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function NewRoomButton({
  matterId,
  onCreated,
}: {
  matterId: string;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('dataRoom');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const create = useCreateDataRoom(matterId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {t('new')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newTitle')}</DialogTitle>
          <DialogDescription>{t('newDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="dr-name">{t('nameLabel')}</Label>
          <Input
            id="dr-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            disabled={create.isPending || name.trim().length < 2}
            onClick={() =>
              create.mutate(
                { name: name.trim() },
                {
                  onSuccess: (d) => {
                    onCreated(d.id);
                    setOpen(false);
                    setName('');
                  },
                },
              )
            }
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomManager({
  matterId,
  roomId,
  onDeleted,
}: {
  matterId: string;
  roomId: string;
  onDeleted: () => void;
}) {
  const t = useTranslations('dataRoom');
  const { data: room, isLoading } = useDataRoom(roomId);
  const actions = useDataRoomActions(roomId, matterId);
  const [newFolder, setNewFolder] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadFolder, setUploadFolder] = useState<string>('');

  if (isLoading || !room) return <Skeleton className="h-64 w-full" />;

  const folderName = (id: string | null) =>
    id ? (room.folders.find((f) => f.id === id)?.name ?? '—') : t('rootFolder');

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{room.name}</h3>
            {room.watermark && (
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="size-3" /> {t('watermarkOn')}
              </Badge>
            )}
          </div>
        </div>

        {/* Carpetas */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--brand-strong)]">{t('folders')}</h4>
          <div className="flex flex-wrap gap-1.5">
            {room.folders.map((f) => (
              <Badge key={f.id} variant="secondary" className="gap-1">
                {f.name}
                <button onClick={() => actions.removeFolder.mutate(f.id)} aria-label={t('delete')}>
                  <Trash2 className="size-3" />
                </button>
              </Badge>
            ))}
            {room.folders.length === 0 && (
              <span className="text-xs text-muted-foreground">{t('noFolders')}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder={t('newFolderPlaceholder')}
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolder.trim()) {
                  actions.addFolder.mutate(
                    { name: newFolder.trim() },
                    { onSuccess: () => setNewFolder('') },
                  );
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              disabled={!newFolder.trim()}
              onClick={() =>
                actions.addFolder.mutate(
                  { name: newFolder.trim() },
                  { onSuccess: () => setNewFolder('') },
                )
              }
            >
              <FolderPlus className="size-4" />
            </Button>
          </div>
        </section>

        {/* Documentos */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[var(--brand-strong)]">{t('documents')}</h4>
            <div className="flex items-center gap-2">
              <select
                value={uploadFolder}
                onChange={(e) => setUploadFolder(e.target.value)}
                className="h-8 rounded-md border bg-[var(--surface-1)] px-2 text-xs"
              >
                <option value="">{t('rootFolder')}</option>
                {room.folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    actions.uploadDocument.mutate({ file, folderId: uploadFolder || undefined });
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" /> {t('upload')}
              </Button>
              <LinkDocButton
                room={room}
                matterId={matterId}
                folderId={uploadFolder}
                actions={actions}
              />
            </div>
          </div>
          <div className="divide-y divide-border rounded-md border">
            {room.documents.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <FileText className="size-4 text-[var(--brand)]" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  {folderName(d.folderId)}
                </Badge>
                <span className="hidden text-xs text-muted-foreground md:inline">
                  {formatBytes(d.sizeBytes)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => downloadDataRoomDoc(d.id, d.name)}>
                  <Download className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => actions.removeDocument.mutate(d.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {room.documents.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t('noDocuments')}
              </div>
            )}
          </div>
        </section>

        {/* Accesos (enlaces mágicos) */}
        <GrantsSection room={room} actions={actions} />

        {/* Q&A + Log */}
        <QuestionsSection roomId={roomId} />
        <AccessLogSection roomId={roomId} />

        <div className="flex justify-end">
          <DeleteRoomButton roomId={roomId} onDeleted={onDeleted} />
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteRoomButton({ roomId, onDeleted }: { roomId: string; onDeleted: () => void }) {
  const t = useTranslations('dataRoom');
  const del = useDeleteDataRoom();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-[var(--danger)]"
      disabled={del.isPending}
      onClick={() => {
        if (confirm(t('deleteConfirm'))) del.mutate(roomId, { onSuccess: onDeleted });
      }}
    >
      <Trash2 className="size-4" /> {t('deleteRoom')}
    </Button>
  );
}

function LinkDocButton({
  room,
  matterId,
  folderId,
  actions,
}: {
  room: DataRoomDetail;
  matterId: string;
  folderId: string;
  actions: ReturnType<typeof useDataRoomActions>;
}) {
  const t = useTranslations('dataRoom');
  const [open, setOpen] = useState(false);
  const { data: documents } = useMatterDocuments(matterId);
  const [versionId, setVersionId] = useState('');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(true)}>
        <Link2 className="size-4" /> {t('linkFromMatter')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('linkTitle')}</DialogTitle>
          <DialogDescription>{t('linkDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="dr-link">{t('document')}</Label>
          <select
            id="dr-link"
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            className={selectClass}
          >
            <option value="">{t('chooseDocument')}</option>
            {documents?.map((d) =>
              d.versions[0] ? (
                <option key={d.id} value={d.versions[0].id}>
                  {d.name} (v{d.versions[0].version})
                </option>
              ) : null,
            )}
          </select>
          <p className="text-xs text-muted-foreground">
            {t('intoFolder', {
              folder: room.folders.find((f) => f.id === folderId)?.name ?? t('rootFolder'),
            })}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            disabled={!versionId || actions.linkDocument.isPending}
            onClick={() =>
              actions.linkDocument.mutate(
                { versionId, folderId: folderId || undefined },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            {actions.linkDocument.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('link')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrantsSection({
  room,
  actions,
}: {
  room: DataRoomDetail;
  actions: ReturnType<typeof useDataRoomActions>;
}) {
  const t = useTranslations('dataRoom');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [canDownload, setCanDownload] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = () => {
    actions.createGrant.mutate(
      {
        email: email.trim(),
        canDownload,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      },
      {
        onSuccess: (res) => {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          setCreatedLink(`${origin}/${locale}/dataroom/${res.token}`);
          setEmail('');
        },
      },
    );
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--brand-strong)]">{t('access')}</h4>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => {
            setCreatedLink(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> {t('invite')}
        </Button>
      </div>
      <div className="divide-y divide-border rounded-md border">
        {room.grants.map((g) => (
          <div key={g.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{g.email}</span>
            {g.revokedAt ? (
              <Badge variant="outline">{t('revoked')}</Badge>
            ) : g.expiresAt && new Date(g.expiresAt) < new Date() ? (
              <Badge variant="outline">{t('expired')}</Badge>
            ) : (
              <Badge>{t('active')}</Badge>
            )}
            {!g.canDownload && <Badge variant="secondary">{t('viewOnly')}</Badge>}
            <span className="hidden text-xs text-muted-foreground md:inline">
              {g.lastAccessAt
                ? t('lastAccess', { date: formatDateTime(g.lastAccessAt, locale) })
                : t('neverAccessed')}
            </span>
            {!g.revokedAt && (
              <Button size="sm" variant="ghost" onClick={() => actions.revokeGrant.mutate(g.id)}>
                {t('revoke')}
              </Button>
            )}
          </div>
        ))}
        {room.grants.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t('noGrants')}</div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('inviteTitle')}</DialogTitle>
            <DialogDescription>{t('inviteDescription')}</DialogDescription>
          </DialogHeader>
          {createdLink ? (
            <div className="space-y-2">
              <p className="text-sm">{t('linkReady')}</p>
              <div className="flex items-center gap-2 rounded-md border bg-[var(--surface-2)] p-2">
                <code className="min-w-0 flex-1 truncate text-xs">{createdLink}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(createdLink);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('linkOnce')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dr-email">{t('emailLabel')}</Label>
                <Input
                  id="dr-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dr-exp">{t('expiresInDays')}</Label>
                  <Input
                    id="dr-exp"
                    inputMode="numeric"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={canDownload}
                    onChange={(e) => setCanDownload(e.target.checked)}
                  />
                  {t('allowDownload')}
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {createdLink ? t('close') : t('cancel')}
            </Button>
            {!createdLink && (
              <Button disabled={!email.trim() || actions.createGrant.isPending} onClick={submit}>
                {actions.createGrant.isPending && <Loader2 className="size-4 animate-spin" />}
                {t('generateLink')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function QuestionsSection({ roomId }: { roomId: string }) {
  const t = useTranslations('dataRoom');
  const { data: questions } = useDataRoomQuestions(roomId);
  const answer = useAnswerDataRoomQuestion(roomId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!questions) return null;

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-[var(--brand-strong)]">{t('qa')}</h4>
      {questions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('noQuestions')}</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => (
            <div key={q.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{q.askedByEmail}</span>
                <Badge variant={q.status === 'ANSWERED' ? 'default' : 'outline'}>
                  {q.status === 'ANSWERED' ? t('answered') : t('openQ')}
                </Badge>
              </div>
              <p className="mt-1">{q.body}</p>
              {q.answer ? (
                <p className="mt-2 rounded bg-[var(--surface-2)] p-2 text-xs">{q.answer}</p>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Input
                    value={drafts[q.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    placeholder={t('answerPlaceholder')}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={!drafts[q.id]?.trim() || answer.isPending}
                    onClick={() => answer.mutate({ questionId: q.id, answer: drafts[q.id].trim() })}
                  >
                    {t('reply')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AccessLogSection({ roomId }: { roomId: string }) {
  const t = useTranslations('dataRoom');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { data: log } = useDataRoomAccessLog(open ? roomId : null);

  return (
    <section className="space-y-2">
      <button
        className="text-sm font-semibold text-[var(--brand-strong)] hover:underline"
        onClick={() => setOpen((o) => !o)}
      >
        {t('accessLog')} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="max-h-64 overflow-auto rounded-md border text-xs">
          {(log ?? []).map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-0"
            >
              <span className="w-36 shrink-0 text-muted-foreground">
                {formatDateTime(e.createdAt, locale)}
              </span>
              <span className="flex-1 truncate">{e.actorEmail}</span>
              <Badge variant="outline">{t(`action.${e.action}`)}</Badge>
            </div>
          ))}
          {log && log.length === 0 && (
            <div className="px-3 py-4 text-center text-muted-foreground">{t('noAccess')}</div>
          )}
        </div>
      )}
    </section>
  );
}
