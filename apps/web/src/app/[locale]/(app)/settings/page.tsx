'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CreditCard,
  FileBadge,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  useAddHoliday,
  useCreateStaff,
  useGoogleCalendarSync,
  useGoogleConnect,
  useGoogleDisconnect,
  useGoogleStatus,
  useMicrosoftCalendarSync,
  useMicrosoftConnect,
  useMicrosoftDisconnect,
  useMicrosoftStatus,
  useRemoveHoliday,
  useSeats,
  useSettings,
  useStaff,
  useStripeOnboard,
  useStripeStatus,
  useUpdateSettings,
  useUpdateStaff,
  useUploadCertificate,
} from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
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
import { cn, isEmailish } from '@/lib/utils';
import { AdminResetPasswordButton } from '@/components/lexora/admin-reset-password';
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
      <HolidaysCard />
      <CertificateCard />
      <GoogleCard />
      <MicrosoftCard />
      <StripeCard />
    </div>
  );
}

/** Conexión de cobro online con Stripe Connect (Standard). El dinero va a la cuenta del despacho. */
function StripeCard() {
  const t = useTranslations('settings');
  const status = useStripeStatus();
  const onboard = useStripeOnboard();

  function connect() {
    onboard.mutate(undefined, {
      onSuccess: ({ url }) => {
        window.location.href = url;
      },
    });
  }

  const onlineEnabled = status.data?.onlineEnabled ?? false;
  const connected = status.data?.connected ?? false;

  return (
    <Section
      icon={<CreditCard className="size-5 text-[var(--brand)]" />}
      title={t('stripe.title')}
      desc={t('stripe.desc')}
      action={
        onlineEnabled ? (
          <Button size="sm" variant="outline" onClick={connect} disabled={onboard.isPending}>
            {onboard.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
            {connected ? t('stripe.manage') : t('stripe.connect')}
          </Button>
        ) : undefined
      }
    >
      {status.isLoading ? (
        <Skeleton className="h-6 w-40" />
      ) : !onlineEnabled ? (
        <p className="text-sm text-muted-foreground">{t('stripe.unavailable')}</p>
      ) : (
        <Badge variant={connected ? 'success' : 'warning'}>
          {connected ? t('stripe.connected') : t('stripe.pending')}
        </Badge>
      )}
    </Section>
  );
}

function GoogleCard() {
  return (
    <ProviderCard
      paramKey="google"
      icon={<CalendarClock className="size-5 text-[var(--brand)]" />}
      titleKey="googleTitle"
      descKey="googleDesc"
      status={useGoogleStatus()}
      connect={useGoogleConnect()}
      disconnect={useGoogleDisconnect()}
      sync={useGoogleCalendarSync()}
    />
  );
}

function MicrosoftCard() {
  return (
    <ProviderCard
      paramKey="microsoft"
      icon={<CalendarCheck className="size-5 text-[var(--brand)]" />}
      titleKey="microsoftTitle"
      descKey="microsoftDesc"
      status={useMicrosoftStatus()}
      connect={useMicrosoftConnect()}
      disconnect={useMicrosoftDisconnect()}
      sync={useMicrosoftCalendarSync()}
    />
  );
}

type OAuthStatusData = { configured: boolean; connected: boolean; email: string | null };

/** Tarjeta genérica de proveedor OAuth (Google/Microsoft): conectar/desconectar + sincronizar agenda. */
function ProviderCard({
  paramKey,
  icon,
  titleKey,
  descKey,
  status,
  connect,
  disconnect,
  sync,
}: {
  paramKey: string;
  icon: ReactNode;
  titleKey: string;
  descKey: string;
  status: { data?: OAuthStatusData; isLoading: boolean; refetch: () => void };
  connect: { mutateAsync: () => Promise<{ url: string }>; isPending: boolean };
  disconnect: { mutate: () => void; isPending: boolean };
  sync: { mutateAsync: () => Promise<{ pushed: number; errors: number }>; isPending: boolean };
}) {
  const t = useTranslations('integrations');
  const params = useSearchParams();

  useEffect(() => {
    const g = params.get(paramKey);
    if (g === 'connected') {
      toast.success(t('connected'));
      status.refetch();
    } else if (g === 'error') toast.error(t('connectError'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doConnect() {
    const { url } = await connect.mutateAsync();
    window.location.href = url;
  }
  async function doSync() {
    const r = await sync.mutateAsync();
    toast.success(t('synced', { n: r.pushed }));
  }

  const data = status.data;
  return (
    <Section
      icon={icon}
      title={t(titleKey)}
      desc={t(descKey)}
      action={
        data?.connected ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
          >
            {t('disconnect')}
          </Button>
        ) : data?.configured ? (
          <Button size="sm" onClick={doConnect} disabled={connect.isPending}>
            {connect.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
            {t('connect')}
          </Button>
        ) : undefined
      }
    >
      {status.isLoading ? (
        <Skeleton className="h-6 w-40" />
      ) : !data?.configured ? (
        <p className="text-sm text-muted-foreground">{t('notConfigured')}</p>
      ) : !data.connected ? (
        <p className="text-sm text-muted-foreground">{t('connectHint')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="success">{t('connectedAs', { email: data.email ?? '' })}</Badge>
          <Button size="sm" variant="outline" onClick={doSync} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t('syncNow')}
          </Button>
        </div>
      )}
    </Section>
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
  const [series, setSeries] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Skeleton className="h-44 w-full rounded-xl" />;
  const tenant = data.tenant;
  const nameVal = name ?? tenant.name;
  const taxVal = taxId ?? tenant.taxId ?? '';
  const seriesVal = series ?? tenant.invoiceSeries;
  const dirty =
    nameVal !== tenant.name ||
    taxVal !== (tenant.taxId ?? '') ||
    seriesVal !== tenant.invoiceSeries;

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({
        name: nameVal.trim(),
        taxId: taxVal.trim() || undefined,
        invoiceSeries: seriesVal.trim() || undefined,
      });
      setName(null);
      setTaxId(null);
      setSeries(null);
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
        <div className="space-y-1.5">
          <Label>{t('firm.series')}</Label>
          <Input
            value={seriesVal}
            onChange={(e) => setSeries(e.target.value)}
            className="font-mono uppercase"
            maxLength={10}
          />
          <p className="text-[11px] text-[var(--text-subtle)]">{t('firm.seriesHint')}</p>
        </div>
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
              <AdminResetPasswordButton userId={u.id} variant="ghost" />
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

  const emailValid = isEmailish(email);
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !noSeat && !create.isPending) submit();
          }}
        >
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
              <PasswordInput
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
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!valid || noSeat || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {t('staff.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HolidaysCard() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const { data } = useSettings();
  const add = useAddHoliday();
  const remove = useRemoveHoliday();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await add.mutateAsync({ date, name: name.trim() });
      setDate('');
      setName('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('holidays.error'));
    }
  }

  const holidays = data?.holidays ?? [];

  return (
    <Section
      icon={<CalendarOff className="size-5 text-[var(--brand)]" />}
      title={t('holidays.title')}
      desc={t('holidays.desc')}
    >
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label>{t('holidays.date')}</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label>{t('holidays.name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          size="sm"
          onClick={submit}
          disabled={!date || name.trim().length < 2 || add.isPending}
        >
          {add.isPending && <Loader2 className="animate-spin" />}
          <Plus /> {t('holidays.add')}
        </Button>
      </div>
      {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}
      {holidays.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{t('holidays.empty')}</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {holidays.map((h) => (
            <div key={h.date} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="font-mono tabular-nums text-muted-foreground">
                {formatDate(h.date, locale)}
              </span>
              <span className="flex-1">{h.name}</span>
              <button
                type="button"
                onClick={() => remove.mutate(h.date)}
                disabled={remove.isPending}
                aria-label={t('holidays.remove')}
                className="text-muted-foreground transition-colors hover:text-[var(--danger)]"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function CertificateCard() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const { data } = useSettings();
  const upload = useUploadCertificate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      await upload.mutateAsync(file);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('cert.error'));
    }
  }

  const cert = data?.certificate;

  return (
    <Section
      icon={<FileBadge className="size-5 text-[var(--brand)]" />}
      title={t('cert.title')}
      desc={t('cert.desc')}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          {cert ? t('cert.replace') : t('cert.upload')}
        </Button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".p12,.pfx,.pem,.cer,.crt"
        className="hidden"
        onChange={onFile}
      />
      {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}
      {cert ? (
        <div className="flex items-center gap-2 rounded-lg border bg-[var(--success-soft)] px-3 py-2.5 text-[13px]">
          <FileBadge className="size-4 text-[var(--success)]" />
          <span className="font-medium">{cert.name}</span>
          {cert.uploadedAt && (
            <span className="ml-auto text-[11.5px] text-muted-foreground">
              {formatDate(cert.uploadedAt, locale)}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">{t('cert.none')}</p>
      )}
    </Section>
  );
}
