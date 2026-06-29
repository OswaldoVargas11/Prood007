'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { useAuth, type RegisterTenantInput } from '@/lib/auth';
import { useRouter, Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/lexora/logo';
import { cn, isEmailish } from '@/lib/utils';

type Jur = 'es' | 'do';
type Cur = 'EUR' | 'DOP';

/** Validación de formato ligera (informativa). El servidor es la verdad al emitir/crear clientes. */
function fiscalLooksValid(jur: Jur, value: string): boolean {
  const v = value.trim().toUpperCase();
  if (!v) return false;
  return jur === 'es' ? /^[A-Z0-9]{8,9}$/.test(v) : /^\d{9}$|^\d{11}$/.test(v);
}

/**
 * Alta de despacho — formulario único (dirección "Sello · luz": claro, minimalista, forzado a claro
 * con `lz-light`). Sustituye al wizard de 5 pasos: el usuario ve todo de una vez, rellena y entra al
 * panel con un solo envío. Los datos fiscales son opcionales y se revelan bajo demanda para no
 * recargar el formulario. Split editorial a la izquierda con las ventajas REALES (verificadas en
 * código): 15 días sin tarjeta, todo incluido, registro fiscal encadenado, cifrado AES-256.
 */
export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const { register } = useAuth();
  const router = useRouter();

  const [firm, setFirm] = useState('');
  const [firmSize, setFirmSize] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState<Jur | null>(null);
  const [currency, setCurrency] = useState<Cur | null>(null);
  const [showFiscal, setShowFiscal] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [fiscalAddress, setFiscalAddress] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptLegal, setAcceptLegal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailValid = isEmailish(email);
  const fiscalValid = jurisdiction ? fiscalLooksValid(jurisdiction, taxId) : false;

  const canSubmit = useMemo(
    () =>
      firm.trim().length >= 2 &&
      jurisdiction !== null &&
      currency !== null &&
      fullName.trim().length >= 2 &&
      emailValid &&
      password.length >= 10 &&
      acceptLegal,
    [firm, jurisdiction, currency, fullName, emailValid, password, acceptLegal],
  );

  function selectJurisdiction(j: Jur) {
    setJurisdiction(j);
    // Sugerir la moneda de la jurisdicción si aún no se eligió.
    setCurrency((c) => c ?? (j === 'do' ? 'DOP' : 'EUR'));
  }

  async function submit() {
    if (!canSubmit || submitting) return;
    setServerError(null);
    const input: RegisterTenantInput = {
      tenantName: firm.trim(),
      jurisdiction: jurisdiction!,
      currency: currency!,
      taxId: taxId.trim() || undefined,
      fiscalAddress: fiscalAddress.trim() || undefined,
      firmSize: firmSize ?? undefined,
      acceptLegal,
      admin: {
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      },
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

  const fiscalLabel = jurisdiction === 'do' ? t('step4.labelDo') : t('step4.labelEs');
  const fiscalPlaceholder = jurisdiction === 'do' ? '1-31-12345-6' : 'B12345678';

  const values = [t('aside.v1'), t('aside.v2'), t('aside.v3'), t('aside.v4')];

  return (
    <main className="lz-light relative grid min-h-screen grid-rows-1 overflow-hidden bg-background text-foreground lg:grid-cols-[1.05fr_minmax(480px,0.95fr)]">
      {/* ── Panel editorial (ventajas reales) — solo en pantallas grandes ── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-[var(--surface-2)] p-12 lg:flex xl:p-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(78% 60% at 28% 22%, #000 0%, transparent 76%)',
            WebkitMaskImage: 'radial-gradient(78% 60% at 28% 22%, #000 0%, transparent 76%)',
            opacity: 0.7,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: '-12%',
            top: '-16%',
            width: 760,
            height: 620,
            background: 'radial-gradient(50% 50% at 42% 32%, var(--brand-soft), transparent 70%)',
          }}
        />

        <div className="relative z-10">
          <Logo size={32} />
        </div>

        <div className="relative z-10 max-w-[34ch]">
          <p className="mb-6 font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="text-[var(--brand)]">●</span> {t('aside.tag')}
          </p>
          <h1 className="text-[clamp(32px,3.2vw,48px)] font-[580] leading-[1.06] tracking-[-0.035em] text-foreground">
            {t('aside.title')}
          </h1>
          <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-muted-foreground">
            {t('aside.sub')}
          </p>
          <ul className="mt-8 flex flex-col gap-3.5">
            {values.map((v) => (
              <li key={v} className="flex items-start gap-3 text-[14px] text-foreground/90">
                <span className="mt-0.5 flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                  <Check className="size-3" />
                </span>
                {v}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10">
          <div
            className="mb-4 h-px w-full max-w-md"
            style={{ background: 'linear-gradient(90deg, var(--seal-line), transparent)' }}
          />
          <div className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <ShieldCheck size={14} className="text-[var(--seal-strong)]" aria-hidden />
            <span>{t('aside.compliance')}</span>
          </div>
        </div>
      </aside>

      {/* ── Columna del formulario ── */}
      <div className="relative flex flex-col overflow-y-auto px-6 py-10 sm:px-10 lg:py-12">
        <div className="mx-auto w-full max-w-[460px]">
          <div className="mb-8 lg:hidden">
            <Logo size={28} />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('formTitle')}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t('formSub')}</p>

          <form
            className="mt-8 flex flex-col gap-7"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {/* Sección · Tu despacho */}
            <section className="flex flex-col gap-4">
              <SectionLabel>{t('secFirm')}</SectionLabel>

              <Field label={t('firm')} htmlFor="ob-firm">
                <Input
                  id="ob-firm"
                  name="organization"
                  autoComplete="organization"
                  value={firm}
                  onChange={(e) => setFirm(e.target.value)}
                  placeholder="Bufete Aurora"
                  autoFocus
                  className="h-11"
                />
              </Field>

              <div>
                <Label className="mb-2 block text-[12.5px] text-muted-foreground">
                  {t('jurisdictionLabel')}
                </Label>
                <div
                  role="radiogroup"
                  aria-label={t('jurisdictionLabel')}
                  className="grid grid-cols-2 gap-3"
                >
                  <ChoiceCard
                    selected={jurisdiction === 'es'}
                    onClick={() => selectJurisdiction('es')}
                    emoji="🇪🇸"
                    title={t('jurisdiction.es')}
                    sub="UE · EUR"
                    accent="Verifactu · AEAT"
                  />
                  <ChoiceCard
                    selected={jurisdiction === 'do'}
                    onClick={() => selectJurisdiction('do')}
                    emoji="🇩🇴"
                    title={t('jurisdiction.do')}
                    sub="El Caribe · DOP"
                    accent="e-CF · DGII"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block text-[12.5px] text-muted-foreground">
                  {t('currencyLabel')}
                </Label>
                <div
                  role="radiogroup"
                  aria-label={t('currencyLabel')}
                  className="inline-flex rounded-xl border border-border bg-[var(--surface-1)] p-1"
                >
                  <SegItem selected={currency === 'EUR'} onClick={() => setCurrency('EUR')}>
                    € EUR
                  </SegItem>
                  <SegItem selected={currency === 'DOP'} onClick={() => setCurrency('DOP')}>
                    RD$ DOP
                  </SegItem>
                </div>
                <p className="mt-2 text-[11.5px] text-[var(--text-subtle)]">{t('currencyHint')}</p>
              </div>

              <div>
                <Label className="mb-2 block text-[12.5px] text-muted-foreground">
                  {t('firmSizeLabel')}{' '}
                  <span className="text-[var(--text-subtle)]">· {t('optional')}</span>
                </Label>
                <div
                  className="flex flex-wrap gap-2"
                  role="radiogroup"
                  aria-label={t('firmSizeLabel')}
                >
                  {(['1', '2-5', '6-20', '21+'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={firmSize === k}
                      onClick={() => setFirmSize((v) => (v === k ? null : k))}
                      className={cn(
                        'rounded-lg border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                        firmSize === k
                          ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                          : 'border-border text-muted-foreground hover:border-[var(--brand-line)]',
                      )}
                    >
                      {t(`firmSize.${k}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Datos fiscales · opcionales, plegados por defecto */}
              {!showFiscal ? (
                <button
                  type="button"
                  onClick={() => setShowFiscal(true)}
                  className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[var(--brand)] transition-opacity hover:opacity-80"
                >
                  <Plus className="size-3.5" /> {t('fiscalToggle')}
                  <span className="font-normal text-[var(--text-subtle)]">
                    · {t('fiscalOptional')}
                  </span>
                </button>
              ) : (
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-[var(--surface-1)] p-4">
                  <Field label={fiscalLabel} htmlFor="ob-taxId">
                    <div className="relative">
                      <Input
                        id="ob-taxId"
                        name="taxId"
                        value={taxId}
                        onChange={(e) => setTaxId(e.target.value)}
                        placeholder={fiscalPlaceholder}
                        autoCapitalize="characters"
                        spellCheck={false}
                        className="h-11 pr-20 font-mono"
                      />
                      {fiscalValid && (
                        <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-[var(--success-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--success)]">
                          <Check className="size-3" />
                          {t('valid')}
                        </span>
                      )}
                    </div>
                  </Field>
                  <Field label="Domicilio fiscal" htmlFor="ob-fiscalAddress">
                    <Input
                      id="ob-fiscalAddress"
                      name="street-address"
                      autoComplete="street-address"
                      value={fiscalAddress}
                      onChange={(e) => setFiscalAddress(e.target.value)}
                      placeholder="Calle Mayor 1, 28013 Madrid"
                      className="h-11"
                    />
                  </Field>
                  <p className="text-[11.5px] leading-relaxed text-[var(--text-subtle)]">
                    {t('step4.hint')}
                  </p>
                </div>
              )}
            </section>

            {/* Sección · Tu cuenta */}
            <section className="flex flex-col gap-4">
              <SectionLabel>{t('secAccount')}</SectionLabel>

              <Field label={t('fullName')} htmlFor="ob-fullName">
                <Input
                  id="ob-fullName"
                  name="name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Marco Reyes"
                  className="h-11"
                />
              </Field>
              <Field label={t('email')} htmlFor="ob-email">
                <Input
                  id="ob-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="marco@bufeteaurora.es"
                  className="h-11"
                />
              </Field>
              <Field label={`${t('phoneLabel')} · ${t('optional')}`} htmlFor="ob-phone">
                <Input
                  id="ob-phone"
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+34 600 000 000"
                  className="h-11"
                />
              </Field>
              <Field label={t('password')} hint={t('passwordHint')} htmlFor="ob-password">
                <PasswordInput
                  id="ob-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-11"
                />
              </Field>

              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-[var(--surface-1)] p-3">
                <span className="flex size-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand)]">
                  A
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-foreground">{t('adminRole')}</div>
                  <div className="text-[11.5px] text-[var(--text-subtle)]">{t('adminDesc')}</div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={acceptLegal}
                  onChange={(e) => setAcceptLegal(e.target.checked)}
                  className="mt-0.5 size-4 flex-shrink-0 accent-[var(--brand)]"
                />
                <span className="text-[12px] leading-relaxed text-muted-foreground">
                  Acepto los{' '}
                  <Link
                    href="/terms"
                    target="_blank"
                    className="font-medium text-[var(--brand)] underline underline-offset-2"
                  >
                    Términos del Servicio
                  </Link>
                  , la{' '}
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="font-medium text-[var(--brand)] underline underline-offset-2"
                  >
                    Política de Privacidad
                  </Link>{' '}
                  y el Acuerdo de Encargado del Tratamiento (DPA), que forma parte de los Términos.
                </span>
              </label>
            </section>

            {serverError && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-6 text-[14px] font-semibold text-white shadow-[var(--shadow-sm)] transition-[opacity,box-shadow] hover:shadow-[var(--shadow-md)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {t('createFree')}
            </button>

            <p className="text-center text-[12.5px] text-muted-foreground">
              {t('toLogin')}{' '}
              <Link href="/login" className="font-medium text-[var(--brand)] hover:underline">
                {t('login')}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] text-[var(--text-subtle)]">{hint}</p>}
    </div>
  );
}

function SegItem({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors',
        selected ? 'bg-[var(--brand)] text-white' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function ChoiceCard({
  selected,
  onClick,
  emoji,
  title,
  sub,
  accent,
}: {
  selected: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  sub: string;
  accent: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'relative rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-[var(--brand-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[20px]">{emoji}</span>
        {selected && (
          <span className="flex size-5 items-center justify-center rounded-full bg-[var(--brand)]">
            <Check className="size-3 text-white" />
          </span>
        )}
      </div>
      <div className="mt-2 text-[14px] font-semibold text-foreground">{title}</div>
      <div className="mt-0.5 text-[11px] text-[var(--text-subtle)]">{sub}</div>
      <div className="mt-1.5 text-[11px] font-semibold text-[var(--brand)]">{accent}</div>
    </button>
  );
}
