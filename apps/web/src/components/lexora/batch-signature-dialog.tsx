'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useRequestBatchSignature } from '@/lib/hooks';
import type { MatterDocument } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Envía a firma un CONJUNTO de documentos del expediente (la versión más reciente de cada uno) con un
 * mismo firmante. Reutiliza el endpoint batch que itera la solicitud individual.
 */
export function BatchSignatureDialog({
  open,
  onClose,
  matterId,
  documents,
}: {
  open: boolean;
  onClose: () => void;
  matterId: string;
  documents: MatterDocument[];
}) {
  const t = useTranslations('signBatch');
  const batch = useRequestBatchSignature(matterId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [done, setDone] = useState<{ created: number; failed: number } | null>(null);

  // Solo documentos con al menos una versión (hay algo que firmar).
  const signable = useMemo(() => documents.filter((d) => d.versions.length > 0), [documents]);

  function toggle(versionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) next.delete(versionId);
      else next.add(versionId);
      return next;
    });
  }

  const valid = selected.size > 0 && signerName.trim().length > 0 && /.+@.+\..+/.test(signerEmail);

  function submit() {
    batch.mutate(
      { versionIds: [...selected], signerName: signerName.trim(), signerEmail: signerEmail.trim() },
      { onSuccess: (r) => setDone(r) },
    );
  }

  function close() {
    setSelected(new Set());
    setSignerName('');
    setSignerEmail('');
    setDone(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('desc')}</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm">{t('result', { created: done.created, failed: done.failed })}</p>
            <Button size="sm" onClick={close}>
              {t('close')}
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !batch.isPending) submit();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>{t('documents')}</Label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {signable.length === 0 && (
                  <p className="px-1 py-2 text-[12.5px] text-muted-foreground">{t('noDocs')}</p>
                )}
                {signable.map((d) => {
                  const versionId = d.versions[0].id;
                  return (
                    <label
                      key={d.id}
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-accent/60"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(versionId)}
                        onChange={() => toggle(versionId)}
                      />
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto font-mono text-[10.5px] text-[var(--text-subtle)]">
                        v{d.versions[0].version}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sb-name">{t('signerName')}</Label>
                <Input
                  id="sb-name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sb-email">{t('signerEmail')}</Label>
                <Input
                  id="sb-email"
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                />
              </div>
            </div>
            {batch.isError && <p className="text-sm text-[var(--danger)]">{t('error')}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={close}>
                {t('cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={!valid || batch.isPending}>
                {batch.isPending && <Loader2 className="animate-spin" />}
                {t('send', { count: selected.size })}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
