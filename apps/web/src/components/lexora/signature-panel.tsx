'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, PenLine, RotateCw, X } from 'lucide-react';
import { useCancelSignature, useDocumentSignatures, useRequestSignature } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  isSignaturePending,
  isSignatureResendable,
  signatureStatusVariant,
} from '@/lib/signature-status';

const inputCls =
  'flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Panel de firma electrónica (Signaturit) de un documento: lista las solicitudes con su estado y
 * permite pedir la firma de la versión vigente al firmante (nombre + email). Solo staff. Fase 5.
 */
export function SignaturePanel({
  documentId,
  latestVersionId,
}: {
  documentId: string;
  latestVersionId: string;
}) {
  const t = useTranslations('signatures');
  const { data, isLoading } = useDocumentSignatures(documentId);
  const requestSig = useRequestSignature(documentId);
  const cancelSig = useCancelSignature(documentId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await requestSig.mutateAsync({
        versionId: latestVersionId,
        signerName: name.trim(),
        signerEmail: email.trim(),
      });
      setOpen(false);
      setName('');
      setEmail('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  function resend(signerName: string, signerEmail: string) {
    setOpen(true);
    setName(signerName);
    setEmail(signerEmail);
    setError(null);
  }

  return (
    <div className="mt-1 space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <PenLine className="size-3.5 text-[var(--brand)]" /> {t('title')}
        </span>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[11.5px] font-medium text-[var(--brand)] hover:underline"
          >
            {t('request')}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-2 rounded-[9px] border bg-[var(--surface-1)] p-2.5">
          <input
            className={inputCls}
            placeholder={t('signerName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={inputCls}
            type="email"
            placeholder={t('signerEmail')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="text-[11.5px] text-[var(--danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={requestSig.isPending || !name.trim() || !email.trim()}
            >
              {requestSig.isPending && <Loader2 className="animate-spin" />}
              {t('send')}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-[11.5px] text-[var(--text-subtle)]">{t('loading')}</p>
      ) : !data || data.length === 0 ? (
        <p className="text-[11.5px] text-[var(--text-subtle)]">{t('empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {data.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-[11.5px]">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.signerName}</div>
                <div className="truncate text-[var(--text-subtle)]">{s.signerEmail}</div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <Badge variant={signatureStatusVariant(s.status)}>
                  {t(`statuses.${s.status}`)}
                </Badge>
                {isSignaturePending(s.status) && (
                  <button
                    type="button"
                    title={t('cancelRequest')}
                    onClick={() => cancelSig.mutate(s.id)}
                    disabled={cancelSig.isPending}
                    className="text-[var(--text-subtle)] transition-colors hover:text-[var(--danger)]"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
                {isSignatureResendable(s.status) && (
                  <button
                    type="button"
                    title={t('resend')}
                    onClick={() => resend(s.signerName, s.signerEmail)}
                    className="text-[var(--text-subtle)] transition-colors hover:text-[var(--brand)]"
                  >
                    <RotateCw className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
