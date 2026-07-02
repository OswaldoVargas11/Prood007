'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/lexora/confirm-dialog';
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
  useMfaDisable,
  useMfaEnable,
  useMfaSetup,
  useMfaStatus,
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
  useDgiiStatus,
  useUploadDgiiCertificate,
  useVerifactuStatus,
  useUploadVerifactuCertificate,
} from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <FirmCard />
      <LicenseCard />
      <StaffCard />
      <HolidaysCard />
      <SecurityCard />
      <CertificateCard />
      <VerifactuCertificateCard />
      <DgiiCertificateCard />
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

/** Seguridad de la cuenta: verificación en dos pasos (2FA TOTP) con QR, código y códigos de respaldo. */
function SecurityCard() {
  const t = useTranslations('security.mfa');
  const status = useMfaStatus();
  const setup = useMfaSetup();
  const enable = useMfaEnable();
  const disable = useMfaDisable();
  const [setupData, setSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const enabled = status.data?.enabled;

  async function startSetup() {
    const d = await setup.mutateAsync();
    setSetupData({ secret: d.secret, qrDataUrl: d.qrDataUrl });
  }
  async function confirmEnable() {
    try {
      const r = await enable.mutateAsync(code.trim());
      setBackupCodes(r.backupCodes);
      setSetupData(null);
      setCode('');
      toast.success(t('enabled'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('error'));
    }
  }
  async function confirmDisable() {
    try {
      await disable.mutateAsync(disableCode.trim());
      setDisabling(false);
      setDisableCode('');
      toast.success(t('disabled'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('error'));
    }
  }

  const showEnableBtn = enabled === false && !setupData && !backupCodes;
  const showDisableBtn = enabled === true && !disabling && !backupCodes;

  return (
    <Section
      icon={<ShieldCheck className="size-5 text-[var(--brand)]" />}
      title={t('title')}
      desc={t('desc')}
      action={
        showEnableBtn ? (
          <Button size="sm" onClick={startSetup} disabled={setup.isPending}>
            {setup.isPending ? <Loader2 className="animate-spin" /> : null}
            {t('enable')}
          </Button>
        ) : showDisableBtn ? (
          <Button size="sm" variant="outline" onClick={() => setDisabling(true)}>
            {t('disable')}
          </Button>
        ) : undefined
      }
    >
      {status.isLoading ? (
        <Skeleton className="h-6 w-40" />
      ) : backupCodes ? (
        <div className="space-y-2">
          <p className="text-[13px] font-medium">{t('backupTitle')}</p>
          <p className="text-[12.5px] text-muted-foreground">{t('backupHint')}</p>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border bg-[var(--surface-1)] p-3 font-mono text-[12.5px]">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => setBackupCodes(null)}>
            {t('backupDone')}
          </Button>
        </div>
      ) : setupData ? (
        <div className="space-y-3">
          <p className="text-[13px]">{t('setupStep1')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setupData.qrDataUrl}
            alt="QR"
            className="size-44 rounded-lg border bg-white p-1"
          />
          <p className="text-[12px] text-muted-foreground">
            {t('setupManual')}{' '}
            <code className="rounded bg-[var(--surface-1)] px-1 font-mono text-[11.5px]">
              {setupData.secret}
            </code>
          </p>
          <p className="text-[13px]">{t('setupStep2')}</p>
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="h-8 w-32 text-center tracking-[0.2em]"
            />
            <Button
              size="sm"
              onClick={confirmEnable}
              disabled={enable.isPending || code.length < 6}
            >
              {enable.isPending ? <Loader2 className="animate-spin" /> : null}
              {t('activate')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSetupData(null)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : disabling ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px]">{t('disablePrompt')}</span>
          <Input
            inputMode="numeric"
            placeholder="123456"
            value={disableCode}
            onChange={(e) =>
              setDisableCode(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 12))
            }
            className="h-8 w-32 text-center tracking-[0.2em]"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={confirmDisable}
            disabled={disable.isPending || disableCode.trim().length < 6}
          >
            {disable.isPending ? <Loader2 className="animate-spin" /> : null}
            {t('confirmDisable')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDisabling(false)}>
            {t('cancel')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {enabled && <Badge variant="success">{t('on')}</Badge>}
          <p className="text-sm text-muted-foreground">
            {enabled ? t('statusOn') : t('statusOff')}
          </p>
        </div>
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
          <Label htmlFor="firm-name">{t('firm.name')}</Label>
          <Input
            id="firm-name"
            name="organization"
            autoComplete="organization"
            value={nameVal}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="firm-taxid">{t('firm.taxId')}</Label>
          <Input
            id="firm-taxid"
            name="taxId"
            autoComplete="off"
            spellCheck={false}
            value={taxVal}
            onChange={(e) => setTaxId(e.target.value)}
            className="font-mono"
            placeholder="—"
          />
        </div>
        <Readonly label={t('firm.jurisdiction')} value={tenant.jurisdiction.toUpperCase()} />
        <Readonly label={t('firm.currency')} value={tenant.currency} />
        <div className="space-y-1.5">
          <Label htmlFor="firm-series">{t('firm.series')}</Label>
          <Input
            id="firm-series"
            name="invoiceSeries"
            autoComplete="off"
            value={seriesVal}
            onChange={(e) => setSeries(e.target.value)}
            className="font-mono uppercase"
            maxLength={10}
          />
          <p className="text-[11px] text-[var(--text-subtle)]">{t('firm.seriesHint')}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border bg-[var(--surface-1)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium">{t('firm.deadlineEmail')}</div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{t('firm.deadlineEmailHint')}</p>
        </div>
        <Switch
          checked={tenant.deadlineEmailRemindersEnabled}
          disabled={update.isPending}
          aria-label={t('firm.deadlineEmail')}
          onCheckedChange={(v) => update.mutate({ deadlineEmailRemindersEnabled: v })}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
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
      {/* Solo lectura: borde discontinuo + fondo apagado para distinguirlo de un campo editable. */}
      <div className="flex h-9 items-center rounded-md border border-dashed bg-[var(--surface-2)] px-3 text-sm text-muted-foreground">
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
  const [confirmDeactivate, setConfirmDeactivate] = useState<StaffUser | null>(null);

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
      {error && (
        <p role="alert" className="mb-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
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
                aria-label={`${t('staff.title')} · ${u.fullName}`}
                className="h-8 rounded-md border bg-[var(--surface-1)] px-2 text-[12.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="FIRM_ADMIN">{roleLabel('FIRM_ADMIN')}</option>
                <option value="LAWYER">{roleLabel('LAWYER')}</option>
              </select>
              <AdminResetPasswordButton userId={u.id} variant="ghost" />
              <Button
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() => (u.isActive ? setConfirmDeactivate(u) : toggleActive(u))}
              >
                {u.isActive ? t('staff.deactivate') : t('staff.activate')}
              </Button>
              <RateEditor user={u} />
            </div>
          ))}
        </div>
      )}
      <AddStaffDialog open={adding} onClose={() => setAdding(false)} seatsFull={seats} />
      <ConfirmDialog
        open={confirmDeactivate !== null}
        onOpenChange={(o) => !o && setConfirmDeactivate(null)}
        title={t('staff.deactivateConfirmTitle')}
        description={t('staff.deactivateConfirmBody', {
          name: confirmDeactivate?.fullName ?? '',
        })}
        confirmLabel={t('staff.deactivate')}
        loading={update.isPending}
        onConfirm={() => {
          const u = confirmDeactivate;
          setConfirmDeactivate(null);
          if (u) void toggleActive(u);
        }}
      />
    </Section>
  );
}

/** Editor de tarifas (rate card) de un letrado: facturación (autorellena partes) y coste (margen real). */
function RateEditor({ user }: { user: StaffUser }) {
  const t = useTranslations('settings');
  const update = useUpdateStaff();
  const [bill, setBill] = useState(user.billRate ?? '');
  const [cost, setCost] = useState(user.costRate ?? '');
  const dirty = bill !== (user.billRate ?? '') || cost !== (user.costRate ?? '');

  async function save() {
    await update.mutateAsync({ id: user.id, billRate: bill, costRate: cost });
    toast.success(t('staff.ratesSaved'));
  }

  return (
    <div className="flex w-full basis-full flex-wrap items-end gap-3 border-t pt-3">
      <RateField label={t('staff.billRate')} value={bill} onChange={setBill} />
      <RateField
        label={t('staff.costRate')}
        value={cost}
        onChange={setCost}
        hint={t('staff.costRateHint')}
      />
      <Button size="sm" variant="outline" disabled={!dirty || update.isPending} onClick={save}>
        {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {t('staff.saveRates')}
      </Button>
    </div>
  );
}

function RateField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        inputMode="decimal"
        placeholder="—"
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        className="h-8 w-28"
      />
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
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
              <Label htmlFor="staff-fullname">{t('staff.fullName')}</Label>
              <Input
                id="staff-fullname"
                name="fullName"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-email">{t('staff.email')}</Label>
              <Input
                id="staff-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-password">{t('staff.password')}</Label>
              <PasswordInput
                id="staff-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-role">{t('staff.role')}</Label>
              <select
                id="staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
                className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  const [confirmDate, setConfirmDate] = useState<string | null>(null);

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
          <Label htmlFor="holiday-date">{t('holidays.date')}</Label>
          <Input
            id="holiday-date"
            name="holidayDate"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="holiday-name">{t('holidays.name')}</Label>
          <Input
            id="holiday-name"
            name="holidayName"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
      {error && (
        <p role="alert" className="mb-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
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
                onClick={() => setConfirmDate(h.date)}
                disabled={remove.isPending}
                aria-label={t('holidays.remove')}
                className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-[var(--danger)] focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmDate !== null}
        onOpenChange={(o) => !o && setConfirmDate(null)}
        title={t('holidays.removeConfirmTitle')}
        description={t('holidays.removeConfirmBody')}
        confirmLabel={t('holidays.remove')}
        loading={remove.isPending}
        onConfirm={() => {
          const d = confirmDate;
          setConfirmDate(null);
          if (d) remove.mutate(d);
        }}
      />
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

/**
 * Certificado Verifactu (.p12 + contraseña) para FIRMAR los registros de facturación y remitirlos a la
 * AEAT. Solo despachos de jurisdicción ES. Sin certificado, la emisión sigue funcionando (registro
 * encadenado SIN firma): el aviso lo deja claro para llegar a la obligación de 2027 con margen.
 */
function VerifactuCertificateCard() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const { data } = useSettings();
  const status = useVerifactuStatus();
  const upload = useUploadVerifactuCertificate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (data?.tenant.jurisdiction !== 'es') return null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!password.trim()) {
      setError(t('verifactu.passwordRequired'));
      return;
    }
    setError(null);
    try {
      await upload.mutateAsync({ file, password });
      setPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('verifactu.error'));
    }
  }

  const cert = status.data;
  return (
    <Section
      icon={<FileBadge className="size-5 text-[var(--brand)]" />}
      title={t('verifactu.title')}
      desc={t('verifactu.desc')}
    >
      <div className="space-y-3">
        {cert?.uploaded ? (
          <div className="flex items-center gap-2 rounded-lg border bg-[var(--success-soft)] px-3 py-2.5 text-[13px]">
            <FileBadge className="size-4 text-[var(--success)]" />
            <span className="font-medium">{cert.name ?? t('verifactu.uploaded')}</span>
            {cert.uploadedAt && (
              <span className="ml-auto text-[11.5px] text-muted-foreground">
                {formatDate(cert.uploadedAt, locale)}
              </span>
            )}
          </div>
        ) : (
          <p className="rounded-lg border bg-[var(--warning-soft)] px-3 py-2.5 text-[12.5px]">
            {t('verifactu.noneWarning')}
          </p>
        )}
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('verifactu.password')}
            className="sm:max-w-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            {cert?.uploaded ? t('verifactu.replace') : t('verifactu.upload')}
          </Button>
        </div>
        <input ref={fileRef} type="file" accept=".p12,.pfx" className="hidden" onChange={onFile} />
      </div>
    </Section>
  );
}

/** Certificado DGII (.p12 + contraseña) para transmitir e-CF. Solo despachos de jurisdicción RD (do). */
function DgiiCertificateCard() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const { data } = useSettings();
  const status = useDgiiStatus();
  const upload = useUploadDgiiCertificate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (data?.tenant.jurisdiction !== 'do') return null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!password.trim()) {
      setError(t('dgii.passwordRequired'));
      return;
    }
    setError(null);
    try {
      await upload.mutateAsync({ file, password });
      setPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('dgii.error'));
    }
  }

  const cert = status.data?.certificate;
  return (
    <Section
      icon={<FileBadge className="size-5 text-[var(--brand)]" />}
      title={t('dgii.title')}
      desc={t('dgii.desc')}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span
            className={`inline-block size-2 rounded-full ${status.data?.enabled ? 'bg-[var(--success)]' : 'bg-muted-foreground/40'}`}
          />
          {status.data?.enabled
            ? t('dgii.enabledOn', { env: status.data.environment ?? '' })
            : t('dgii.enabledOff')}
        </div>
        {cert?.uploaded ? (
          <div className="flex items-center gap-2 rounded-lg border bg-[var(--success-soft)] px-3 py-2.5 text-[13px]">
            <FileBadge className="size-4 text-[var(--success)]" />
            <span className="font-medium">{cert.name ?? t('dgii.uploaded')}</span>
            {cert.uploadedAt && (
              <span className="ml-auto text-[11.5px] text-muted-foreground">
                {formatDate(cert.uploadedAt, locale)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">{t('dgii.none')}</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('dgii.password')}
            className="sm:max-w-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            {cert?.uploaded ? t('dgii.replace') : t('dgii.upload')}
          </Button>
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <input ref={fileRef} type="file" accept=".p12,.pfx" className="hidden" onChange={onFile} />
      </div>
    </Section>
  );
}
