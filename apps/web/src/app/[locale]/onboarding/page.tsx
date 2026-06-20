'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { useAuth, type RegisterTenantInput } from '@/lib/auth';
import { useRouter, Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/lexora/theme-toggle';
import { Logo } from '@/components/lexora/logo';
import { cn, isEmailish } from '@/lib/utils';

type Jur = 'es' | 'do';
type Cur = 'EUR' | 'DOP';

const TOTAL_STEPS = 5;

/** Validación de formato ligera (informativa). El servidor es la verdad al emitir/crear clientes. */
function fiscalLooksValid(jur: Jur, value: string): boolean {
  const v = value.trim().toUpperCase();
  if (!v) return false;
  return jur === 'es' ? /^[A-Z0-9]{8,9}$/.test(v) : /^\d{9}$|^\d{11}$/.test(v);
}

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const { register } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [firm, setFirm] = useState('');
  const [jurisdiction, setJurisdiction] = useState<Jur | null>(null);
  const [currency, setCurrency] = useState<Cur | null>(null);
  const [taxId, setTaxId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailValid = isEmailish(email);
  const fiscalValid = jurisdiction ? fiscalLooksValid(jurisdiction, taxId) : false;

  const canContinue = useMemo(() => {
    switch (step) {
      case 1:
        return firm.trim().length >= 2;
      case 2:
        return jurisdiction !== null;
      case 3:
        return currency !== null;
      case 4:
        return true; // el identificador fiscal es opcional en el alta
      case 5:
        return fullName.trim().length >= 2 && emailValid && password.length >= 10;
      default:
        return false;
    }
  }, [step, firm, jurisdiction, currency, fullName, emailValid, password]);

  function selectJurisdiction(j: Jur) {
    setJurisdiction(j);
    // Sugerir la moneda de la jurisdicción si aún no se eligió.
    setCurrency((c) => c ?? (j === 'do' ? 'DOP' : 'EUR'));
  }

  function back() {
    setServerError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function next() {
    if (!canContinue) return;
    setServerError(null);
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
      return;
    }
    // Paso final: crear el despacho.
    const input: RegisterTenantInput = {
      tenantName: firm.trim(),
      jurisdiction: jurisdiction!,
      currency: currency!,
      taxId: taxId.trim() || undefined,
      admin: { fullName: fullName.trim(), email: email.trim(), password },
    };
    setSubmitting(true);
    try {
      await register(input);
      router.replace('/dashboard');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('genericError'));
      setSubmitting(false);
    }
  }

  const steps = [
    { n: 1, label: t('step1.nav') },
    { n: 2, label: t('step2.nav') },
    { n: 3, label: t('step3.nav') },
    { n: 4, label: t('step4.nav') },
    { n: 5, label: t('step5.nav') },
  ];

  const fiscalLabel = jurisdiction === 'do' ? t('step4.labelDo') : t('step4.labelEs');
  const fiscalPlaceholder = jurisdiction === 'do' ? '1-31-12345-6' : 'B12345678';
  const compliance = jurisdiction === 'do' ? 'e-CF · DGII' : 'Verifactu · AEAT';

  return (
    <main className="relative flex h-screen overflow-hidden">
      <div className="absolute right-5 top-5 z-10">
        <ThemeToggle />
      </div>

      {/* Rail izquierdo: pasos + resumen */}
      <aside className="hidden w-80 flex-shrink-0 flex-col border-r bg-card/50 p-8 md:flex">
        <div className="mb-8 flex items-center">
          <Logo size={26} />
        </div>

        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          {t('setup')}
        </div>
        <div className="flex flex-col gap-0.5">
          {steps.map((s) => {
            const done = s.n < step;
            const active = s.n === step;
            return (
              <div key={s.n} className="flex items-center gap-3 py-2">
                <span
                  className={cn(
                    'flex size-6 flex-shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums',
                    done && 'border-transparent bg-[var(--brand)] text-white',
                    active && 'border-[var(--brand)] text-[var(--brand)]',
                    !done && !active && 'border-border text-[var(--text-subtle)]',
                  )}
                >
                  {done ? <Check className="size-3" /> : s.n}
                </span>
                <span
                  className={cn(
                    'text-[13px]',
                    active ? 'font-medium text-foreground' : 'text-[var(--text-subtle)]',
                  )}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-auto rounded-xl border bg-card p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            {t('summary')}
          </div>
          <div className="flex flex-col gap-2 text-[12.5px]">
            <SummaryRow label={t('firm')} value={firm.trim() || '—'} />
            <SummaryRow
              label={t('jurisdictionLabel')}
              value={jurisdiction ? t(`jurisdiction.${jurisdiction}`) : '—'}
            />
            <SummaryRow label={t('currencyLabel')} value={currency ?? '—'} mono />
            <SummaryRow label={fiscalLabel} value={taxId.trim() || '—'} mono />
          </div>
          {jurisdiction && (
            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <span className="size-1.5 rounded-sm bg-[var(--brand)]" />
              <span className="text-[11.5px] font-semibold text-[var(--brand)]">{compliance}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Contenido del paso */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-[3px] bg-[var(--surface-1)]">
          <div
            className="h-full bg-gradient-to-r from-[var(--ai-from)] to-[var(--ai-to)] transition-[width] duration-500"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
          <div className="w-full max-w-[520px]">
            <div className="font-mono text-xs font-semibold text-[var(--brand)]">
              {step} / {TOTAL_STEPS}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t(`step${step}.title`)}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t(`step${step}.sub`)}
            </p>

            <div className="mt-7">
              {step === 1 && (
                <Input
                  value={firm}
                  onChange={(e) => setFirm(e.target.value)}
                  placeholder="Bufete Aurora"
                  autoFocus
                  className="h-12 text-base"
                  onKeyDown={(e) => e.key === 'Enter' && next()}
                />
              )}

              {step === 2 && (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <ChoiceCard
                    selected={jurisdiction === 'es'}
                    onClick={() => selectJurisdiction('es')}
                    emoji="🇪🇸"
                    title="España"
                    sub="Unión Europea · EUR"
                    accent="Verifactu · AEAT"
                    note="IVA 21% + IRPF"
                  />
                  <ChoiceCard
                    selected={jurisdiction === 'do'}
                    onClick={() => selectJurisdiction('do')}
                    emoji="🇩🇴"
                    title="República Dominicana"
                    sub="El Caribe · DOP"
                    accent="e-CF · DGII"
                    note="ITBIS 18%"
                  />
                </div>
              )}

              {step === 3 && (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <ChoiceCard
                    selected={currency === 'EUR'}
                    onClick={() => setCurrency('EUR')}
                    glyph="€"
                    title={t('currency.eurName')}
                    sub="EUR · €1.234,56"
                  />
                  <ChoiceCard
                    selected={currency === 'DOP'}
                    onClick={() => setCurrency('DOP')}
                    glyph="RD$"
                    title={t('currency.dopName')}
                    sub="DOP · RD$1,234.56"
                  />
                </div>
              )}

              {step === 4 && (
                <div>
                  <Label className="mb-2 block text-[12.5px] text-muted-foreground">
                    {fiscalLabel}
                  </Label>
                  <div className="relative">
                    <Input
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      placeholder={fiscalPlaceholder}
                      autoFocus
                      className="h-12 pr-24 font-mono text-base"
                      onKeyDown={(e) => e.key === 'Enter' && next()}
                    />
                    {fiscalValid && (
                      <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-[var(--success-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--success)]">
                        <Check className="size-3" />
                        {t('valid')}
                      </span>
                    )}
                  </div>
                  <p className="mt-3.5 text-xs leading-relaxed text-[var(--text-subtle)]">
                    {t('step4.hint')}
                  </p>
                </div>
              )}

              {step === 5 && (
                <div className="flex flex-col gap-3.5">
                  <Field label={t('fullName')}>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Marco Reyes"
                      autoFocus
                    />
                  </Field>
                  <Field label={t('email')}>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="marco@bufeteaurora.es"
                      autoComplete="email"
                    />
                  </Field>
                  <Field label={t('password')} hint={t('passwordHint')}>
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      onKeyDown={(e) => e.key === 'Enter' && next()}
                    />
                  </Field>
                  <div className="flex items-center gap-2.5 rounded-xl border bg-[var(--surface-1)] p-3">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand)]">
                      A
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold">{t('adminRole')}</div>
                      <div className="text-[11.5px] text-[var(--text-subtle)]">
                        {t('adminDesc')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {serverError && (
                <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
                  {serverError}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t px-8 py-4">
          {step === 1 ? (
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              ‹ {t('toLogin')}
            </Link>
          ) : (
            <button
              type="button"
              onClick={back}
              disabled={submitting}
              className="rounded-lg border px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              ‹ {t('back')}
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={!canContinue || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-6 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_18px_var(--brand-soft)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {step < TOTAL_STEPS ? t('continue') : t('create')}
          </button>
        </div>
      </div>
    </main>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2.5">
      <span className="text-[var(--text-subtle)]">{label}</span>
      <span
        className={cn(
          'max-w-[160px] truncate text-right font-medium',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-[12.5px] text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] text-[var(--text-subtle)]">{hint}</p>}
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  emoji,
  glyph,
  title,
  sub,
  accent,
  note,
}: {
  selected: boolean;
  onClick: () => void;
  emoji?: string;
  glyph?: string;
  title: string;
  sub: string;
  accent?: string;
  note?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-2xl border bg-card p-[18px] text-left transition-colors hover:border-[var(--brand-line)]',
        selected ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between">
        {emoji ? (
          <span className="text-[22px]">{emoji}</span>
        ) : (
          <span className="text-xl font-semibold">{glyph}</span>
        )}
        {selected && (
          <span className="flex size-5 items-center justify-center rounded-full bg-[var(--brand)]">
            <Check className="size-3 text-white" />
          </span>
        )}
      </div>
      <div className="mt-3 text-[15px] font-semibold">{title}</div>
      <div className="mt-0.5 text-[11.5px] text-[var(--text-subtle)]">{sub}</div>
      {accent && (
        <div className="mt-2.5 text-[11.5px] font-semibold text-[var(--brand)]">{accent}</div>
      )}
      {note && <div className="mt-0.5 text-[11px] text-[var(--text-subtle)]">{note}</div>}
    </button>
  );
}
