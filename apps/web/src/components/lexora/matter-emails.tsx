'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Loader2,
  Mail,
  Paperclip,
  Send,
  Sparkles,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  useAiStatus,
  useAttachMail,
  useDraftEmail,
  useMailStatus,
  useMatterBccAddress,
  useMatterEmails,
  useRecentMail,
  useSendMatterEmail,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import type { MatterEmail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmailSnippetPicker } from './email-snippet-picker';
import { DictateButton } from './dictate-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Correspondencia (email vía Gmail) de un expediente: enviar y adjuntar de la bandeja. */
export function MatterEmails({
  matterId,
  defaultTo,
}: {
  matterId: string;
  defaultTo?: string | null;
}) {
  const t = useTranslations('matterEmails');
  const mstatus = useMailStatus();
  const connected = Boolean(mstatus.data?.provider);
  const emails = useMatterEmails(matterId);
  const [sendOpen, setSendOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  // No conectado: invita a conectar la cuenta en Ajustes (no rompemos la vista del expediente).
  if (mstatus.isSuccess && !connected) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="size-4 text-muted-foreground" /> {t('title')}
        </h3>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {t('connectHint')}{' '}
          <Link
            href="/settings"
            className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
          >
            {t('goSettings')}
          </Link>
        </p>
        <BccLine matterId={matterId} />
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="size-4 text-muted-foreground" /> {t('title')}
        </h3>
        <div className="flex items-center gap-2">
          {mstatus.data?.canAttach && (
            <Button size="sm" variant="outline" onClick={() => setAttachOpen(true)}>
              <Paperclip className="size-4" /> {t('attach')}
            </Button>
          )}
          <Button size="sm" onClick={() => setSendOpen(true)}>
            <Send className="size-4" /> {t('send')}
          </Button>
        </div>
      </div>
      <BccLine matterId={matterId} />

      <div className="mt-3">
        {emails.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !emails.data?.length ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y">
            {emails.data.map((e) => (
              <EmailRow key={e.id} e={e} />
            ))}
          </ul>
        )}
      </div>

      <SendDialog
        matterId={matterId}
        defaultTo={defaultTo}
        open={sendOpen}
        onOpenChange={setSendOpen}
      />
      <AttachDialog matterId={matterId} open={attachOpen} onOpenChange={setAttachOpen} />
    </section>
  );
}

function SendDialog({
  matterId,
  defaultTo,
  open,
  onOpenChange,
}: {
  matterId: string;
  defaultTo?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations('matterEmails');
  const tAi = useTranslations('ai');
  const send = useSendMatterEmail(matterId);
  const { data: aiStatus } = useAiStatus();
  const aiEnabled = Boolean(aiStatus?.enabled);
  const draft = useDraftEmail();
  const [to, setTo] = useState(defaultTo ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');

  async function submit() {
    try {
      await send.mutateAsync({ to, subject, body });
      toast.success(t('sent'));
      setSubject('');
      setBody('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sendError'));
    }
  }

  async function aiDraft() {
    if (!aiEnabled || aiInstructions.trim().length < 2) return;
    try {
      const res = await draft.mutateAsync({ instructions: aiInstructions.trim(), matterId });
      if (res.subject) setSubject(res.subject);
      setBody(res.body);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tAi('error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sendTitle')}</DialogTitle>
          <DialogDescription>{t('sendDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5 rounded-lg border border-dashed bg-[var(--surface-1)] p-2.5">
            <div className="flex items-center gap-2">
              <Input
                placeholder={tAi('draftEmailInstructions')}
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                onKeyDown={(e) => aiEnabled && e.key === 'Enter' && aiDraft()}
                disabled={!aiEnabled}
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={aiDraft}
                disabled={!aiEnabled || draft.isPending || aiInstructions.trim().length < 2}
              >
                {draft.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {tAi('draftEmail')}
              </Button>
            </div>
            {!aiEnabled && (
              <p className="text-[12px] text-muted-foreground">{tAi('disabledShort')}</p>
            )}
          </div>
          <Input
            type="email"
            placeholder={t('to')}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Input
            placeholder={t('subject')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <EmailSnippetPicker
            subject={subject}
            body={body}
            onInsert={(s) => {
              if (!subject.trim() && s.subject) setSubject(s.subject);
              setBody(s.body);
            }}
          />
          <Textarea
            rows={7}
            placeholder={t('body')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex justify-end">
            <DictateButton onText={(text) => setBody((b) => (b ? `${b} ${text}` : text))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={send.isPending || !to || !subject || !body}>
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttachDialog({
  matterId,
  open,
  onOpenChange,
}: {
  matterId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations('matterEmails');
  const recent = useRecentMail(open);
  const attach = useAttachMail(matterId);
  const [busy, setBusy] = useState<string | null>(null);

  async function pick(externalId: string) {
    setBusy(externalId);
    try {
      await attach.mutateAsync(externalId);
      toast.success(t('attached'));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('attachError'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('attachTitle')}</DialogTitle>
          <DialogDescription>{t('attachDesc')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto">
          {recent.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !recent.data?.length ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">{t('inboxEmpty')}</p>
          ) : (
            recent.data.map((m) => (
              <button
                key={m.externalId}
                type="button"
                disabled={busy !== null}
                onClick={() => pick(m.externalId)}
                className="flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
              >
                {busy === m.externalId ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                ) : (
                  <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {m.subject || t('noSubject')}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {m.from} · {m.snippet}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Email-por-BCC: muestra la dirección única del expediente para archivar correos poniéndola en copia
 * oculta. Solo aparece si el conector de correo entrante está activo (gated).
 */
function BccLine({ matterId }: { matterId: string }) {
  const t = useTranslations('matterEmails');
  const { data } = useMatterBccAddress(matterId);
  const [copied, setCopied] = useState(false);

  if (!data?.enabled || !data.address) return null;

  async function copy() {
    if (!data?.address) return;
    try {
      await navigator.clipboard.writeText(data.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sin portapapeles: el usuario puede seleccionar el texto */
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-[var(--surface-1)] p-2.5 text-[12px]">
      <span className="text-muted-foreground">{t('bccHint')}</span>
      <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11.5px]">
        {data.address}
      </code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 text-[var(--brand)] hover:underline"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? t('bccCopied') : t('bccCopy')}
      </button>
    </div>
  );
}

/** Una línea de correspondencia; los correos con cuerpo completo (archivados por BCC) se pueden desplegar. */
function EmailRow({ e }: { e: MatterEmail }) {
  const t = useTranslations('matterEmails');
  const [open, setOpen] = useState(false);
  const hasBody = Boolean(e.body && e.body.trim().length > 0);

  return (
    <li className="flex items-start gap-3 py-2.5">
      {e.direction === 'OUT' ? (
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-blue-600" />
      ) : (
        <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13.5px] font-medium">{e.subject || t('noSubject')}</span>
          <span className="shrink-0 text-[11.5px] text-muted-foreground">
            {formatDate(e.sentAt)}
          </span>
        </div>
        <p className={cn('text-[12px] text-muted-foreground', !open && 'truncate')}>
          {e.direction === 'OUT' ? `→ ${e.toAddr}` : `← ${e.fromAddr}`}
          {e.snippet ? ` · ${e.snippet}` : ''}
        </p>
        {open && hasBody && (
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-[var(--surface-1)] p-2.5 font-sans text-[12px] text-foreground">
            {e.body}
          </pre>
        )}
        {hasBody && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-1 text-[11.5px] font-medium text-[var(--brand)] hover:underline"
          >
            {open ? t('showLess') : t('showMore')}
          </button>
        )}
      </div>
    </li>
  );
}
