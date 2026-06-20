'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ChevronDown, Loader2, Pencil, Scale } from 'lucide-react';
import { useConflictCheck, useUpdateMatter } from '@/lib/hooks';
import type { MatterDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Estado de los campos de partes/procedimiento de un expediente (todos opcionales). */
export type PartiesValue = {
  opposingParty: string;
  opposingPartyTaxId: string;
  opposingCounsel: string;
  court: string;
  caseNumber: string;
  proceduralPhase: string;
};

export const emptyParties: PartiesValue = {
  opposingParty: '',
  opposingPartyTaxId: '',
  opposingCounsel: '',
  court: '',
  caseNumber: '',
  proceduralPhase: '',
};

/** Convierte el estado en cuerpo para la API (solo campos con valor). */
export function partiesToBody(v: PartiesValue) {
  const out: Record<string, string> = {};
  (Object.keys(v) as (keyof PartiesValue)[]).forEach((k) => {
    const val = v[k].trim();
    if (val) out[k] = val;
  });
  return out;
}

/**
 * Aviso deontológico EN VIVO: marca conflicto si la contraparte ya es cliente del despacho o ya
 * figura como parte contraria en otro expediente. No bloquea; el despacho decide.
 */
export function ConflictAlert({ name }: { name: string }) {
  const t = useTranslations('matters.parties');
  const { data } = useConflictCheck(name);
  const clients = data?.matches ?? [];
  const opposing = data?.opposingMatters ?? [];
  if (clients.length === 0 && opposing.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-3 text-[12.5px]">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 text-[var(--warning)]" />
        {t('conflictTitle')}
      </div>
      {clients.length > 0 && (
        <p className="mt-1.5 text-muted-foreground">
          {t('conflictIsClient')}{' '}
          <span className="font-medium text-foreground">
            {clients.map((c) => c.name).join(', ')}
          </span>
        </p>
      )}
      {opposing.length > 0 && (
        <p className="mt-1 text-muted-foreground">
          {t('conflictIsOpposing')}{' '}
          <span className="font-medium text-foreground">
            {opposing.map((m) => m.reference).join(', ')}
          </span>
        </p>
      )}
    </div>
  );
}

/** Contraparte (universal, con aviso de conflicto) + datos del procedimiento (litigación, plegable). */
export function MatterPartiesFields({
  value,
  onChange,
}: {
  value: PartiesValue;
  onChange: (patch: Partial<PartiesValue>) => void;
}) {
  const t = useTranslations('matters.parties');
  const [showProc, setShowProc] = useState(
    Boolean(value.opposingCounsel || value.court || value.caseNumber || value.proceduralPhase),
  );
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('opposingParty')}</Label>
        <Input
          value={value.opposingParty}
          onChange={(e) => onChange({ opposingParty: e.target.value })}
          placeholder={t('opposingPartyPlaceholder')}
        />
        <p className="text-[11px] text-muted-foreground">{t('opposingPartyHint')}</p>
        <ConflictAlert name={value.opposingParty} />
      </div>
      <button
        type="button"
        onClick={() => setShowProc((s) => !s)}
        className="flex w-full items-center gap-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Scale className="size-4" />
        {t('procedureToggle')}
        <ChevronDown className={cn('size-4 transition-transform', showProc && 'rotate-180')} />
      </button>
      {showProc && (
        <div className="grid gap-3 rounded-lg border bg-[var(--surface-1)] p-3 sm:grid-cols-2">
          <PField
            label={t('opposingCounsel')}
            value={value.opposingCounsel}
            onChange={(v) => onChange({ opposingCounsel: v })}
          />
          <PField label={t('court')} value={value.court} onChange={(v) => onChange({ court: v })} />
          <PField
            label={t('caseNumber')}
            value={value.caseNumber}
            onChange={(v) => onChange({ caseNumber: v })}
          />
          <PField
            label={t('proceduralPhase')}
            value={value.proceduralPhase}
            onChange={(v) => onChange({ proceduralPhase: v })}
          />
          <div className="sm:col-span-2">
            <PField
              label={t('opposingPartyTaxId')}
              value={value.opposingPartyTaxId}
              onChange={(v) => onChange({ opposingPartyTaxId: v })}
              mono
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PField({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px]">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('h-8', mono && 'font-mono')}
        placeholder="—"
      />
    </div>
  );
}

function fromMatter(m: MatterDetail): PartiesValue {
  return {
    opposingParty: m.opposingParty ?? '',
    opposingPartyTaxId: m.opposingPartyTaxId ?? '',
    opposingCounsel: m.opposingCounsel ?? '',
    court: m.court ?? '',
    caseNumber: m.caseNumber ?? '',
    proceduralPhase: m.proceduralPhase ?? '',
  };
}

/**
 * Tarjeta de "Partes y procedimiento" en el detalle del expediente: en lectura solo muestra lo que
 * está relleno (un despacho que solo asesora apenas verá nada); en edición usa el formulario completo
 * con el aviso de conflicto en vivo.
 */
export function MatterPartiesCard({ matter }: { matter: MatterDetail }) {
  const t = useTranslations('matters.parties');
  const update = useUpdateMatter(matter.id);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<PartiesValue>(fromMatter(matter));

  const hasAny = Boolean(
    matter.opposingParty ||
    matter.opposingPartyTaxId ||
    matter.opposingCounsel ||
    matter.court ||
    matter.caseNumber ||
    matter.proceduralPhase,
  );

  async function save() {
    // Se envían todos los campos (cadena vacía = limpiar; el backend la interpreta como null).
    await update.mutateAsync({
      opposingParty: v.opposingParty.trim(),
      opposingPartyTaxId: v.opposingPartyTaxId.trim(),
      opposingCounsel: v.opposingCounsel.trim(),
      court: v.court.trim(),
      caseNumber: v.caseNumber.trim(),
      proceduralPhase: v.proceduralPhase.trim(),
    });
    setEditing(false);
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold">{t('cardTitle')}</h3>
          {!editing && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setV(fromMatter(matter));
                setEditing(true);
              }}
            >
              <Pencil className="size-3.5" /> {t('edit')}
            </Button>
          )}
        </div>
        {editing ? (
          <div className="space-y-3">
            <MatterPartiesFields value={v} onChange={(p) => setV((s) => ({ ...s, ...p }))} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('cancel')}
              </Button>
              <Button size="sm" onClick={save} disabled={update.isPending}>
                {update.isPending && <Loader2 className="size-4 animate-spin" />}
                {t('save')}
              </Button>
            </div>
          </div>
        ) : hasAny ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadField label={t('opposingParty')} value={matter.opposingParty} />
            <ReadField label={t('opposingPartyTaxId')} value={matter.opposingPartyTaxId} mono />
            <ReadField label={t('opposingCounsel')} value={matter.opposingCounsel} />
            <ReadField label={t('court')} value={matter.court} />
            <ReadField label={t('caseNumber')} value={matter.caseNumber} mono />
            <ReadField label={t('proceduralPhase')} value={matter.proceduralPhase} />
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">{t('empty')}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ReadField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null; // adaptativo: en lectura solo se ve lo que está relleno
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('font-medium', mono && 'font-mono text-[13px]')}>{value}</div>
    </div>
  );
}
