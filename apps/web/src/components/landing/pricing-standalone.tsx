'use client';

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ArrowRight, Check, Plus } from 'lucide-react';
import {
  Currency,
  FOUNDER,
  PLAN_TIERS,
  buildPlanCatalog,
  type PlanCycle,
  type SubscriptionTierId,
} from '@legalflow/domain';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/lexora/logo';
import { useFounderStatus } from '@/lib/hooks';
import './landing.css';

// ── Reveal-on-scroll (same as landing.tsx) ───────────────────────────────────
type RevealTag = 'div' | 'p' | 'span' | 'h2' | 'h3';
type RevealProps = {
  children?: ReactNode;
  delay?: number;
  as?: RevealTag;
  className?: string;
  style?: CSSProperties;
} & Record<string, unknown>;

function Reveal({ children, delay = 0, as = 'div', className = '', style, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(true);
      setSettled(true);
      return;
    }
    let done = false;
    let settleT: ReturnType<typeof setTimeout>;
    const reveal = () => {
      if (done) return;
      done = true;
      setShown(true);
      settleT = setTimeout(() => setSettled(true), delay + 820);
      cleanup();
    };
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0) reveal();
    };
    const onScroll = () => {
      if (!done) requestAnimationFrame(check);
    };
    function cleanup() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      clearTimeout(safety);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    requestAnimationFrame(check);
    const safety = setTimeout(reveal, 1100);
    return () => {
      cleanup();
      clearTimeout(settleT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finalStyle: CSSProperties = settled
    ? { ...style, opacity: 1, transform: 'none', transition: 'none' }
    : { transitionDelay: shown ? `${delay}ms` : '0ms', ...style };

  return createElement(
    as,
    {
      ref,
      className: `reveal ${shown ? 'in' : ''} ${className}`.trim(),
      style: finalStyle,
      ...rest,
    },
    children,
  );
}

function useCountUp(value: number, ms = 600) {
  const [n, setN] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setN(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const b = value;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setN(Math.round(a + (b - a) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return n;
}

// ── Constants ─────────────────────────────────────────────────────────────────

type Jur = 'ES' | 'RD';

const CYCLES: PlanCycle[] = ['MONTHLY', 'ANNUAL', 'BIENNIAL'];
const CYCLE_LABEL: Record<PlanCycle, string> = {
  MONTHLY: 'Mensual',
  ANNUAL: 'Anual',
  BIENNIAL: 'Bienal',
};

const TIER_COPY: Record<
  SubscriptionTierId,
  { name: string; desc: string; cta: string; feats: string[] }
> = {
  ESENCIAL: {
    name: 'Esencial',
    desc: 'Para el despacho que arranca con todo en regla.',
    cta: 'Empezar',
    feats: [
      'Operaciones, expedientes y clientes',
      'Documentos con versionado',
      'Verifactu (ES) + e-CF (RD)',
      'Cobro online con Stripe',
      'Portal del cliente',
    ],
  },
  PROFESIONAL: {
    name: 'Profesional',
    desc: 'Para despachos transaccionales en activo.',
    cta: 'Empezar',
    feats: [
      'Todo lo de Esencial, y además:',
      'Data room de due diligence',
      'Redline y biblioteca de cláusulas',
      'Checklist de cierre y closing binder',
      'Provisión de fondos y caja',
      'Cupo de asistente IA y firma',
    ],
  },
  AVANZADO: {
    name: 'Avanzado',
    desc: 'Para despachos con volumen y varias sedes.',
    cta: 'Empezar',
    feats: [
      'Todo lo de Profesional, y además:',
      'Multi-jurisdicción ES / RD',
      'Secretaría de sociedades',
      'Auditoría e informes avanzados',
      'SSO y roles avanzados',
      'Soporte prioritario',
    ],
  },
};

const FOUNDER_FEATS = [
  'Funciones del plan Profesional',
  'Onboarding y migración gratis',
  'Cupo de IA y firma ampliado',
  'Línea directa + voto en el roadmap',
  'Sello "Despacho fundador" + caso de éxito',
  'Precio congelado de por vida',
];

const FAQS: [string, string][] = [
  [
    '¿Verifactu ya transmite a la AEAT?',
    'La generación y el encadenamiento de la huella ya son conformes. La transmisión a la AEAT se activa en el onboarding fiscal de tu despacho, cuando conectamos tu certificado.',
  ],
  [
    '¿Puedo llevar España y R. Dominicana en una misma cuenta?',
    'Sí. Cada operación usa los identificadores, impuestos, factura electrónica y moneda de su jurisdicción. Nunca mezclamos monedas dentro de un mismo importe.',
  ],
  [
    '¿Me ayudáis a migrar desde mi programa actual?',
    'Sí. El onboarding y la migración de tus expedientes están incluidos, y son gratis dentro del cupo Fundador.',
  ],
  [
    '¿Con qué datos trabaja el asistente de IA?',
    'Solo con los documentos de tu despacho, y siempre responde con la cita a la fuente y una señal de confianza. Tus datos no se usan para entrenar modelos.',
  ],
  [
    '¿El precio es por usuario?',
    'Sí, por usuario activo. El plan Fundador congela la tarifa de por vida, con prepago anual o bienal.',
  ],
  [
    '¿Necesito una demo para ver el producto?',
    'No. Los precios son públicos y puedes empezar sin llamada de ventas. La demo es opcional, para verlo en directo sobre tu caso.',
  ],
];

const SIGNUP = '/onboarding';

function fmt(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency: currency === Currency.USD ? 'USD' : 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function pct(n: number): string {
  return new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(n);
}

function billNote(cy: PlanCycle, save: number): string {
  if (cy === 'MONTHLY') return 'facturado mensual';
  if (cy === 'ANNUAL') return `−${pct(save)}% · facturado anual · 2 meses gratis`;
  return `−${pct(save)}% · facturado cada 2 años`;
}

// ── Page component ────────────────────────────────────────────────────────────

export function PricingStandalone() {
  const [jur, setJur] = useState<Jur>('ES');
  const [cycle, setCycle] = useState<PlanCycle>('ANNUAL');
  const [openFaq, setOpenFaq] = useState(0);
  const founder = useFounderStatus();

  const currency = jur === 'RD' ? Currency.USD : Currency.EUR;
  const catalog = buildPlanCatalog({}, [Currency.EUR, Currency.USD]);
  const rowFor = (plan: string) =>
    catalog.find((r) => r.plan === plan && r.cycle === cycle && r.currency === currency);
  const founderCycle: PlanCycle = cycle === 'MONTHLY' ? 'ANNUAL' : cycle;
  const founderRow = catalog.find(
    (r) => r.plan === 'FOUNDER' && r.cycle === founderCycle && r.currency === currency,
  );

  const slotsLeft = founder.data?.slotsLeft ?? null;
  const cap = founder.data?.cap ?? FOUNDER.cap;
  const taken = slotsLeft === null ? null : cap - slotsLeft;
  const left = useCountUp(slotsLeft ?? cap, 700);
  const founderOpen = slotsLeft === null || slotsLeft > 0;

  return (
    <div className="lz-land">
      <header className="nav">
        <div className="wrap nav-in">
          <Link href="/" aria-label="Inicio">
            <Logo size={26} />
          </Link>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
            <Link href="/login" className="btn btn-ghost">
              Entrar
            </Link>
            <Link href={SIGNUP} className="btn btn-primary">
              Crear despacho
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="sec" id="precios" style={{ paddingTop: 'var(--sp-14)' }}>
          <div className="wrap">
            <div className="sec-head center">
              <Reveal as="span" className="eyebrow" style={{ justifyContent: 'center' }}>
                <span className="dot" /> Precios públicos
              </Reveal>
              <Reveal as="h2" className="sec-title" delay={60}>
                Tarifa clara, <em>sin llamada de ventas</em>.
              </Reveal>
              <Reveal as="p" className="sec-lead" delay={120} style={{ marginInline: 'auto' }}>
                Por usuario activo. Cuanto más te comprometes, menos pagas.
              </Reveal>

              {/* Jurisdiction toggle */}
              <Reveal
                className="price-toggle"
                delay={140}
                role="tablist"
                aria-label="Jurisdicción"
              >
                {(['ES', 'RD'] as Jur[]).map((j) => (
                  <button
                    key={j}
                    type="button"
                    role="tab"
                    className={jur === j ? 'on' : ''}
                    onClick={() => setJur(j)}
                    aria-selected={jur === j}
                  >
                    {j === 'ES' ? 'España · EUR' : 'R. Dominicana · USD'}
                  </button>
                ))}
              </Reveal>

              {/* Billing cycle toggle */}
              <Reveal
                className="price-toggle"
                delay={160}
                role="tablist"
                aria-label="Periodicidad"
              >
                {CYCLES.map((c) => {
                  const save =
                    catalog.find(
                      (r) => r.plan === 'PROFESIONAL' && r.cycle === c && r.currency === currency,
                    )?.savingsPct ?? 0;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="tab"
                      className={cycle === c ? 'on' : ''}
                      onClick={() => setCycle(c)}
                      aria-selected={cycle === c}
                    >
                      {CYCLE_LABEL[c]}
                      {save > 0 && <span className="save">−{pct(save)}%</span>}
                    </button>
                  );
                })}
              </Reveal>
            </div>

            {/* Tier cards */}
            <div className="tiers">
              {PLAN_TIERS.map((tier, i) => {
                const row = rowFor(tier.id);
                if (!row) return null;
                const copy = TIER_COPY[tier.id];
                return (
                  <Reveal key={tier.id} delay={i * 80} style={{ display: 'flex' }}>
                    <div className={`tier ${tier.popular ? 'featured' : ''}`.trim()}>
                      {tier.popular && <span className="tier-flag">Más elegido</span>}
                      <div className="tier-name">{copy.name}</div>
                      <div className="tier-desc">{copy.desc}</div>
                      <div className="tier-price">
                        <span className="amt mono">{fmt(row.perSeatMonthly, currency)}</span>
                        <span className="per">/ usuario / mes</span>
                      </div>
                      <div className="tier-bill">{billNote(cycle, row.savingsPct)}</div>
                      <ul>
                        {copy.feats.map((f, fi) => {
                          const isHeader = fi === 0 && f.startsWith('Todo');
                          return (
                            <li
                              key={f}
                              style={
                                isHeader ? { color: 'var(--mut)', fontWeight: 500 } : undefined
                              }
                            >
                              {!isHeader && <Check size={15} aria-hidden />}
                              {f}
                            </li>
                          );
                        })}
                      </ul>
                      <Link
                        href={SIGNUP}
                        className={`btn ${tier.popular ? 'btn-primary' : 'btn-outline'} btn-lg`}
                      >
                        {copy.cta}
                        {tier.popular && <ArrowRight size={15} aria-hidden />}
                      </Link>
                    </div>
                  </Reveal>
                );
              })}
            </div>

            {/* Founder — open */}
            {founderOpen && founderRow && (
              <Reveal className="founder">
                <div className="founder-grid">
                  <div>
                    <span className="eyebrow founder-eyebrow">
                      <span className="dot" style={{ background: 'var(--copper-2)' }} /> Cupo
                      fundador
                    </span>
                    <h3>
                      Sé uno de los <em>primeros {cap} despachos</em>.
                    </h3>
                    <p className="founder-lead">
                      Entra con la tarifa fundador y consérvala para siempre. Acceso solo con
                      prepago anual o bienal.
                    </p>
                    <div className="founder-price">
                      <span className="amt mono">
                        {fmt(founderRow.perSeatMonthly, currency)}
                      </span>
                      <span className="note">
                        / usuario / mes · congelado de por vida · funciones Profesional
                      </span>
                    </div>
                    <ul>
                      {FOUNDER_FEATS.map((f) => (
                        <li key={f}>
                          <Check size={15} aria-hidden /> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="cupo">
                    <div className="cupo-n mono">{left}</div>
                    <div className="cupo-k">plazas fundador disponibles</div>
                    <div className="cupo-bar">
                      <i style={{ width: `${((taken ?? 0) / cap) * 100}%` }} />
                    </div>
                    <div className="cupo-meta">
                      <span>{taken === null ? '—' : `${taken} ocupadas`}</span>
                      <span>{cap} en total</span>
                    </div>
                    <Link
                      href={SIGNUP}
                      className="btn btn-lg"
                      style={{
                        background: 'var(--copper-2)',
                        color: '#fff',
                        boxShadow: '0 8px 24px -10px rgba(206,138,58,0.5)',
                      }}
                    >
                      Reservar plaza fundador <ArrowRight size={15} aria-hidden />
                    </Link>
                    <div className="fine">Prepago anual o bienal · sin permanencia adicional</div>
                  </div>
                </div>
              </Reveal>
            )}

            {/* Founder — closed */}
            {!founderOpen && (
              <Reveal>
                <div
                  className="founder"
                  style={{ textAlign: 'center', padding: 'var(--sp-8) var(--sp-6)' }}
                >
                  <span
                    className="eyebrow founder-eyebrow"
                    style={{ justifyContent: 'center' }}
                  >
                    <span className="dot" style={{ background: 'var(--mut)' }} /> Cupo fundador ·
                    cerrado
                  </span>
                  <p style={{ color: 'var(--mut)', marginTop: 'var(--sp-3)' }}>
                    Las {cap} plazas fundador ya están ocupadas. Elige uno de los planes anteriores.
                  </p>
                </div>
              </Reveal>
            )}
          </div>
        </section>

        {/* FAQ */}
        <section className="sec" id="faq">
          <div className="wrap">
            <div className="sec-head center">
              <Reveal as="span" className="eyebrow" style={{ justifyContent: 'center' }}>
                <span className="dot" /> Preguntas frecuentes
              </Reveal>
              <Reveal as="h2" className="sec-title" delay={60}>
                Lo que suelen <em>preguntarnos</em>.
              </Reveal>
            </div>
            <Reveal className="faq" delay={80}>
              {FAQS.map((f, i) => (
                <div
                  className={`faq-item ${openFaq === i ? 'open' : ''}`.trim()}
                  key={f[0]}
                >
                  <button
                    className="faq-q"
                    onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                    aria-expanded={openFaq === i}
                  >
                    {f[0]}
                    <Plus size={19} aria-hidden />
                  </button>
                  <div className="faq-a">
                    <p>{f[1]}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className="sec" style={{ paddingBottom: 40 }}>
          <div className="wrap">
            <Reveal className="final">
              <h2>
                Empieza hoy, <em>gratis 15 días</em>.
              </h2>
              <p>Sin tarjeta de crédito. Sin llamada de ventas. Tu despacho en marcha en minutos.</p>
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--sp-4)',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  marginTop: 'var(--sp-6)',
                }}
              >
                <Link href={SIGNUP} className="btn btn-primary btn-lg">
                  Crear mi despacho <ArrowRight size={16} aria-hidden />
                </Link>
                <Link href="/" className="btn btn-ghost btn-lg">
                  Ver el producto
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer
        style={{
          textAlign: 'center',
          padding: 'var(--sp-8) var(--sp-4)',
          color: 'var(--mut)',
          fontSize: '0.8rem',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--sp-6)', justifyContent: 'center' }}>
          <Link href="/es/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>
            Privacidad
          </Link>
          <Link href="/es/terms" style={{ color: 'inherit', textDecoration: 'none' }}>
            Términos
          </Link>
          <Link href="/es/subprocessors" style={{ color: 'inherit', textDecoration: 'none' }}>
            Subencargados
          </Link>
        </div>
        <p style={{ marginTop: 'var(--sp-3)' }}>© 2026 Lawzora. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
