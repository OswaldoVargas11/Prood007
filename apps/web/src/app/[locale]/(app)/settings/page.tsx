'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, ShieldCheck, UserCog } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  useCreateStaff,
  useSeats,
  useSettings,
  useStaff,
  useUpdateSettings,
  useUpdateStaff,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { StaffRole, StaffUser } from '@/lib/types';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const { hasRole } = useAuth();

  if (!hasRole('FIRM_ADMIN')) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center text-sm text-muted-foreground">
        {t('notAuthorized')}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
      </div>
      <FirmCard />
      <LicenseCard />
      <StaffCard />
    </div>
  );
}

function Section({
  icon,
  title,
  desc,
  action,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        {icon}
        <div className="flex-1">
          <div className="text-[14px] font-semibold">{title}</div>
          {desc && <div className="text-[12px] text-muted-foreground">{desc}</div>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function FirmCard() {
  const t = useTranslations('settings');
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const [name, setName] = useState<string | null>(null);
  const [taxId, setTaxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Skeleton className="h-44 w-full rounded-xl" />;
  const tenant = data.tenant;
  const nameVal = name ?? tenant.name;
  const taxVal = taxId ?? tenant.taxId ?? '';
  const dirty = nameVal !== tenant.name || taxVal !== (tenant.taxId ?? '');

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({ name: nameVal.trim(), taxId: taxVal.trim() || undefined });
      setName(null);
      setTaxId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('saveError'));
    }
  }

  return (
    <Section title={t('firm.title')} desc={t('firm.desc')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t('firm.name')}</Label>
          <Input value={nameVal} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('firm.taxId')}</Label>
          <Input
            value={taxVal}
            onChange={(e) => setTaxId(e.target.value)}
            className="font-mono"
            placeholder="—"
          />
        </div>
        <Readonly label={t('firm.jurisdiction')} value={tenant.jurisdiction.toUpperCase()} />
        <Readonly label={t('firm.currency')} value={tenant.currency} />
      </div>
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending && <Loader2 className="animate-spin" />}
          {t('save')}
        </Button>
      </div>
    </Section>
  );
}

function Readonly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="flex h-9 items-center rounded-md border bg-[var(--surface-1)] px-3 text-sm">
        {value}
      </div>
    </div>
  );
}

function LicenseCard() {
  const t = useTranslations('settings');
  const { data } = useSettings();
  if (!data) return null;
  const { seats, tenant } = data;
  return (
    <Section
      icon={<ShieldCheck className="size-5 text-[var(--brand)]" />}
      title={t('license.title')}
      desc={t('license.desc')}
      action={<Badge variant="info">{tenant.plan}</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SeatMeter label={t('license.admins')} used={seats.admins.used} max={seats.admins.max} />
        <SeatMeter label={t('license.lawyers')} used={seats.lawyers.used} max={seats.lawyers.max} />
      </div>
    </Section>
  );
}

function SeatMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const full = used >= max;
  return (
    <div className="rounded-lg border bg-[var(--surface-1)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        <span
          className={cn('text-[13px] font-semibold tabular-nums', full && 'text-[var(--warning)]')}
        >
          {used} / {max}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: full ? 'var(--warning)' : 'var(--brand)' }}
        />
      </div>
    </div>
  );
}

function StaffCard() {
  const t = useTranslations('settings');
  const { data, isLoading } = useStaff();
  const { data: seats } = useSeats();
  const update = useUpdateStaff();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function roleLabel(role: StaffRole) {
    return role === 'FIRM_ADMIN' ? t('staff.admin') : t('staff.lawyer');
  }

  async function toggleActive(u: StaffUser) {
    setError(null);
    try {
      await update.mutateAsync({ id: u.id, isActive: !u.isActive });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('staff.error'));
    }
  }

  async function changeRole(u: StaffUser, role: StaffRole) {
    setError(null);
    try {
      await update.mutateAsync({ id: u.id, role });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('staff.error'));
    }
  }

  return (
    <Section
      icon={<UserCog className="size-5 text-[var(--brand)]" />}
      title={t('staff.title')}
      desc={t('staff.desc')}
      action={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus /> {t('staff.add')}
        </Button>
      }
    >
      {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
      {isLoading && <Skeleton className="h-32 w-full" />}
      {data && (
        <div className="overflow-hidden rounded-lg border">
          {data.map((u, i) => (
            <div
              key={u.id}
              className={cn(
                'flex flex-wrap items-center gap-3 px-4 py-3',
                i > 0 && 'border-t',
                !u.isActive && 'opacity-60',
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--brand)]">
                {u.fullName.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  {u.fullName}
                  {u.isSelf && (
                    <span className="text-[10px] text-muted-foreground">({t('staff.you')})</span>
                  )}
                </div>
                <div className="truncate text-[11.5px] text-muted-foreground">{u.email}</div>
              </div>
              {!u.isActive && <Badge variant="secondary">{t('staff.inactive')}</Badge>}
              <select
                value={u.role}
                onChange={(e) => changeRole(u, e.target.value as StaffRole)}
                disabled={update.isPending}
                className="h-8 rounded-md border bg-[var(--surface-1)] px-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="FIRM_ADMIN">{roleLabel('FIRM_ADMIN')}</option>
                <option value="LAWYER">{roleLabel('LAWYER')}</option>
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() => toggleActive(u)}
              >
                {u.isActive ? t('staff.deactivate') : t('staff.activate')}
              </Button>
            </div>
          ))}
        </div>
      )}
      <AddStaffDialog open={adding} onClose={() => setAdding(false)} seatsFull={seats} />
    </Section>
  );
}

function AddStaffDialog({
  open,
  onClose,
  seatsFull,
}: {
  open: boolean;
  onClose: () => void;
  seatsFull?: { admins: { used: number; max: number }; lawyers: { used: number; max: number } };
}) {
  const t = useTranslations('settings');
  const create = useCreateStaff();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('LAWYER');
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const valid = emailValid && fullName.trim().length >= 2 && password.length >= 10;
  const noSeat = seatsFull
    ? role === 'FIRM_ADMIN'
      ? seatsFull.admins.used >= seatsFull.admins.max
      : seatsFull.lawyers.used >= seatsFull.lawyers.max
    : false;

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({ email: email.trim(), fullName: fullName.trim(), password, role });
      setEmail('');
      setFullName('');
      setPassword('');
      setRole('LAWYER');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('staff.error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('staff.addTitle')}</DialogTitle>
          <DialogDescription>{t('staff.addDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('staff.fullName')}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>{t('staff.email')}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('staff.password')}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('staff.role')}</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="LAWYER">{t('staff.lawyer')}</option>
              <option value="FIRM_ADMIN">{t('staff.admin')}</option>
            </select>
          </div>
          {noSeat && <p className="text-xs text-[var(--warning)]">{t('staff.noSeat')}</p>}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid || noSeat || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            {t('staff.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
