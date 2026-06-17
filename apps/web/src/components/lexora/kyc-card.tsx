'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useClientKyc, useUpsertKyc } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import type { KycRisk, KycStatus } from '@/lib/types';

const STATUSES: KycStatus[] = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'];
const RISKS: KycRisk[] = ['LOW', 'MEDIUM', 'HIGH'];

/** Tarjeta KYC/AML del cliente: estado de diligencia, riesgo, PEP y verificaciones. Solo staff. */
export function KycCard({ clientId }: { clientId: string }) {
  const t = useTranslations('kyc');
  const { data, isLoading } = useClientKyc(clientId);
  const upsert = useUpsertKyc(clientId);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Estado local sembrado desde el perfil (o valores por defecto si aún no existe).
  const [initId, setInitId] = useState<string | null>(null);
  const [status, setStatus] = useState<KycStatus>('PENDING');
  const [risk, setRisk] = useState<KycRisk>('MEDIUM');
  const [isPep, setIsPep] = useState(false);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [sanctionsChecked, setSanctionsChecked] = useState(false);
  const [notes, setNotes] = useState('');

  const loadedId = isLoading ? null : (data?.id ?? `none:${clientId}`);
  if (loadedId !== initId && !isLoading) {
    setInitId(loadedId);
    setStatus(data?.status ?? 'PENDING');
    setRisk(data?.risk ?? 'MEDIUM');
    setIsPep(data?.isPep ?? false);
    setIdentityVerified(data?.identityVerified ?? false);
    setSanctionsChecked(data?.sanctionsChecked ?? false);
    setNotes(data?.notes ?? '');
  }

  async function save() {
    setError(null);
    setDone(false);
    try {
      await upsert.mutateAsync({ status, risk, isPep, identityVerified, sanctionsChecked, notes });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <ShieldCheck className="size-5 text-[var(--brand)]" />
        <div>
          <CardTitle className="text-[15px]">{t('title')}</CardTitle>
          <p className="text-[12px] text-muted-foreground">{t('subtitle')}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('status')}</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as KycStatus)}
                  className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`statuses.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('risk')}</Label>
                <select
                  value={risk}
                  onChange={(e) => setRisk(e.target.value as KycRisk)}
                  className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {RISKS.map((r) => (
                    <option key={r} value={r}>
                      {t(`risks.${r}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Check
                label={t('identityVerified')}
                checked={identityVerified}
                onChange={setIdentityVerified}
              />
              <Check
                label={t('sanctionsChecked')}
                checked={sanctionsChecked}
                onChange={setSanctionsChecked}
              />
              <Check label={t('isPep')} checked={isPep} onChange={setIsPep} />
            </div>

            <div className="space-y-1.5">
              <Label>{t('notes')}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            {done && <p className="text-sm text-[var(--success)]">{t('saved')}</p>}
            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={upsert.isPending}>
                {upsert.isPending && <Loader2 className="animate-spin" />}
                {t('save')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-border"
      />
      {label}
    </label>
  );
}
