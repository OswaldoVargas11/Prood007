'use client';

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  AlarmClock,
  ArrowRight,
  BookMarked,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  Crown,
  DatabaseBackup,
  DatabaseZap,
  FileLock2,
  FileSignature,
  FileText,
  Folder,
  FolderPlus,
  FolderX,
  GitCompareArrows,
  GitMerge,
  Globe,
  GripVertical,
  HardDrive,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Link2,
  ListChecks,
  Lock,
  Mail,
  Menu,
  Pencil,
  PlayCircle,
  Plus,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Table2,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

/**
 * Landing pública de Lawzora — port fiel del handoff de diseño "Sello" (dark editorial · teal +
 * cobre fiscal). Estructura: Nav · Hero · Problema · Ciclo (scrollytelling de 6 etapas + closing
 * binder) · Bento · Diferenciador fiscal (ES/RD) · Jurisdicción · Seguridad · Precios · FAQ · CTA.
 *
 * Datos coherentes con el producto real: los PRECIOS salen del catálogo canónico (`@legalflow/domain`)
 * y el cupo Fundador del endpoint público (`useFounderStatus`) — cero precios a mano. Todos los CTA de
 * conversión apuntan a `/onboarding` (alta de despacho) y el de sesión a `/login`.
 *
 * Estilos: `landing.css` (generado del handoff, scopeado bajo `.lz-land`). Iconos: lucide-react (el set
 * que ya usa la app). Tipografía sans-forward (Geist) con mono (Geist Mono) para datos fiscales.
 */

// ── Icon bridge (lucide-react por nombre, como en el handoff) ──────────────────
const ICONS: Record<string, LucideIcon> = {
  AlarmClock,
  ArrowRight,
  BookMarked,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  Crown,
  DatabaseBackup,
  DatabaseZap,
  FileLock2,
  FileSignature,
  FileText,
  Folder,
  FolderPlus,
  FolderX,
  GitCompareArrows,
  GitMerge,
  Globe,
  GripVertical,
  HardDrive,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Link2,
  ListChecks,
  Lock,
  Mail,
  Menu,
  Pencil,
  PlayCircle,
  Plus,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Table2,
  Users,
  X,
};

function Icon({
  name,
  size = 18,
  className,
  style,
}: {
  name: keyof typeof ICONS | string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const C = ICONS[name];
  if (!C) return null;
  return <C size={size} className={className} style={style} aria-hidden />;
}

// ── Reveal-on-scroll (port del handoff; el estado final se fija inline para que nunca quede oculto) ──
type RevealTag = 'div' | 'p' | 'span' | 'h1' | 'h2' | 'li';
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

// ── Window chrome + status tag ─────────────────────────────────────────────────
function Win({
  url,
  urlIcon = 'Lock',
  children,
  className = '',
  style,
}: {
  url: string;
  urlIcon?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`win ${className}`.trim()} style={style}>
      <div className="win-bar">
        <div className="win-dots">
          <i />
          <i />
          <i />
        </div>
        <span className="win-url">
          <Icon name={urlIcon} size={12} /> {url}
        </span>
      </div>
      {children}
    </div>
  );
}

function Tag({
  tone = 'teal',
  icon,
  children,
}: {
  tone?: 'teal' | 'ok' | 'info' | 'warn' | 'copper';
  icon?: string;
  children: ReactNode;
}) {
  return (
    <span className={`tag tag-${tone}`}>
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

// CTA destinos reales del producto.
const SIGNUP = '/onboarding'; // alta de despacho (register-tenant)
const LOGIN = '/login';

/** Botón con estilo de la landing que navega a una ruta interna (alta/sesión). */
function CtaLink({
  href,
  variant = 'primary',
  lg = false,
  children,
  style,
}: {
  href: string;
  variant?: 'primary' | 'outline' | 'ghost';
  lg?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Link href={href} className={`btn btn-${variant} ${lg ? 'btn-lg' : ''}`.trim()} style={style}>
      {children}
    </Link>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// NAV
// ───────────────────────────────────────────────────────────────────────────────
const NAV_LINKS: [string, string][] = [
  ['El ciclo', '#ciclo'],
  ['Producto', '#producto'],
  ['Cumplimiento', '#cumplimiento'],
  ['Precios', '#precios'],
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', h, { passive: true });
    h();
    return () => window.removeEventListener('scroll', h);
  }, []);
  // Cierra el panel al pasar a desktop para no dejar estado colgado tras un resize.
  useEffect(() => {
    const h = () => {
      if (window.innerWidth > 860) setOpen(false);
    };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''} ${open ? 'open' : ''}`.trim()}>
      <div className="wrap nav-in">
        <Logo size={26} />
        <nav className="nav-links">
          {NAV_LINKS.map(([label, href]) => (
            <a href={href} key={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className="nav-right">
          <Link href={LOGIN} className="btn btn-ghost">
            Iniciar sesión
          </Link>
          <CtaLink href={SIGNUP}>Empezar ahora</CtaLink>
        </div>
        <button
          type="button"
          className="nav-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
        >
          <Icon name={open ? 'X' : 'Menu'} size={22} />
        </button>
      </div>
      <nav className="nav-mobile" hidden={!open}>
        {NAV_LINKS.map(([label, href]) => (
          <a href={href} key={href} onClick={() => setOpen(false)}>
            {label}
          </a>
        ))}
        <Link href={LOGIN} className="btn btn-outline" onClick={() => setOpen(false)}>
          Iniciar sesión
        </Link>
        <Link href={SIGNUP} className="btn btn-primary" onClick={() => setOpen(false)}>
          Empezar ahora <Icon name="ArrowRight" size={16} />
        </Link>
      </nav>
    </header>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// HERO
// ───────────────────────────────────────────────────────────────────────────────
function Spark() {
  return (
    <svg className="spark" viewBox="0 0 240 46" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--teal)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--teal)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 38 L34 34 L68 36 L102 26 L136 28 L170 16 L204 12 L240 5 L240 46 L0 46 Z"
        fill="url(#spk)"
      />
      <path
        d="M0 38 L34 34 L68 36 L102 26 L136 28 L170 16 L204 12 L240 5"
        fill="none"
        stroke="var(--teal)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeroPanel() {
  return (
    <Reveal className="hero-panel" delay={120}>
      <Win url="lawzora.app · Operaciones" urlIcon="LayoutDashboard">
        <div className="panel-body">
          <div className="panel-main">
            <div className="kpi-row">
              <div className="kpi">
                <div className="kpi-k">Operaciones activas</div>
                <div className="kpi-v">7</div>
                <div className="kpi-d">de 9 en cartera</div>
              </div>
              <div className="kpi">
                <div className="kpi-k">En cierre</div>
                <div className="kpi-v">2</div>
                <div className="kpi-d">este mes</div>
              </div>
              <div className="kpi">
                <div className="kpi-k">Por cobrar</div>
                <div className="kpi-v teal">142.600 €</div>
                <div className="kpi-d">3 facturas</div>
              </div>
            </div>
            <div className="row">
              <div>
                <div className="row-t">Compraventa de TechVentures, S.L.</div>
                <div className="row-m">OP-2026-014 · Inversiones Marbella</div>
              </div>
              <Tag tone="info" icon="DatabaseZap">
                Due diligence
              </Tag>
            </div>
            <div className="row">
              <div>
                <div className="row-t">Reestructuración · Grupo Cádiz</div>
                <div className="row-m">OP-2026-011 · mercantil</div>
              </div>
              <Tag tone="teal" icon="GitCompareArrows">
                Redline
              </Tag>
            </div>
            <div className="row">
              <div>
                <div className="row-t">Edificio Recoletos · compraventa</div>
                <div className="row-m">OP-2026-009 · inmobiliario</div>
              </div>
              <Tag tone="warn" icon="ListChecks">
                Checklist de cierre
              </Tag>
            </div>
          </div>
          <div className="panel-side">
            <div className="side-card">
              <div className="side-h">
                <Icon name="CalendarClock" size={15} /> Próximo cierre
              </div>
              <div className="deadline">
                <div className="date-chip">
                  <b>12</b>
                  <span>JUL</span>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Firma del SPA · TechVentures</div>
                  <div
                    className="mono"
                    style={{ fontSize: 11, color: 'var(--warn)', marginTop: 2 }}
                  >
                    en 20 días · 2 CP pendientes
                  </div>
                </div>
              </div>
            </div>
            <div className="side-card">
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: 12, color: 'var(--mut)' }}>Honorarios facturados</span>
                <span className="mono" style={{ fontSize: 14, fontWeight: 500 }}>
                  318.400 €
                </span>
              </div>
              <Spark />
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>
                últimos 6 meses
              </div>
            </div>
            <div className="side-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: 'var(--teal-soft)',
                  color: 'var(--teal)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                <Icon name="ShieldCheck" size={16} />
              </span>
              <div style={{ fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.4 }}>
                Verifactu y e-CF <b style={{ color: 'var(--txt)' }}>conformes</b>
              </div>
            </div>
          </div>
        </div>
      </Win>
    </Reveal>
  );
}

function Hero() {
  const trust: [string, string, string][] = [
    ['ShieldCheck', 'Verifactu', 'ES'],
    ['ShieldCheck', 'e-CF', 'RD'],
    ['Landmark', 'AEAT', ''],
    ['Landmark', 'DGII', ''],
    ['Lock', 'RGPD · Ley 172-13', ''],
  ];
  return (
    <section className="hero" id="top">
      <div className="hero-grid-bg" />
      <div className="hero-glow" />
      <div className="wrap hero-in">
        <Reveal as="p" className="eyebrow" style={{ justifyContent: 'center' }}>
          <span className="dot" /> Software para despachos transaccionales · ES &amp; RD
        </Reveal>
        <Reveal as="h1" delay={60}>
          Del encargo al cierre, <em>en un sitio</em>.
        </Reveal>
        <Reveal as="p" className="hero-sub" delay={120}>
          Gestiona la operación completa —
          <b>data room, redline, checklist de cierre y facturación con Verifactu</b>— sin saltar
          entre programas. El closing binder se ensambla solo.
        </Reveal>
        <Reveal className="hero-cta" delay={180}>
          <CtaLink href={SIGNUP} lg>
            Empezar ahora <Icon name="ArrowRight" size={16} />
          </CtaLink>
          <a href="#ciclo" className="btn btn-outline btn-lg">
            <Icon name="PlayCircle" size={16} /> Ver el ciclo
          </a>
        </Reveal>
        <Reveal as="p" className="hero-note" delay={220}>
          Precios públicos · cupo Fundador abierto · sin llamada de ventas
        </Reveal>
        <Reveal className="trust" delay={260}>
          <div className="trust-label">
            Construido para el cumplimiento fiscal de España y R. Dominicana
          </div>
          <div className="trust-row">
            {trust.map((t) => (
              <span className="trust-item" key={t[1]}>
                <Icon name={t[0]} size={15} /> {t[1]} {t[2] && <span className="j">{t[2]}</span>}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
      <HeroPanel />
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// PROBLEMA
// ───────────────────────────────────────────────────────────────────────────────
function Problem() {
  const items: [string, string, string][] = [
    [
      'FolderX',
      'El expediente vive en seis sitios',
      'Word para el contrato, Excel para el checklist, el data room en un Drive, las facturas en otro programa.',
    ],
    [
      'GitMerge',
      'Las versiones se pierden',
      'Nadie sabe cuál es el último redline ni qué cambió desde la vuelta anterior.',
    ],
    [
      'AlarmClock',
      'El cierre se gestiona de memoria',
      'Condiciones suspensivas y firmas en una hoja suelta, con el riesgo encima.',
    ],
    [
      'ReceiptText',
      'Y luego, facturar en regla',
      'Verifactu y e-CF obligan a un encadenamiento que tu programa de gestión no hace.',
    ],
  ];
  const chips = [
    { t: 'Contrato.docx', ic: 'FileText', x: '4%', y: '6%', r: '-6deg' },
    { t: 'Checklist.xlsx', ic: 'Table2', x: '52%', y: '0%', r: '5deg' },
    { t: 'Data room — Drive', ic: 'HardDrive', x: '24%', y: '30%', r: '-2deg' },
    { t: 'Re: redline v4 (final)(2)', ic: 'Mail', x: '40%', y: '54%', r: '4deg' },
    { t: 'facturacion.exe', ic: 'ReceiptText', x: '2%', y: '64%', r: '3deg' },
    { t: 'Firmas.pdf', ic: 'FileSignature', x: '58%', y: '78%', r: '-5deg' },
  ];
  return (
    <section className="prob-band" id="problema">
      <div className="wrap sec">
        <div className="prob-grid">
          <div>
            <Reveal as="span" className="eyebrow">
              <span className="dot" /> El problema del transaccional
            </Reveal>
            <Reveal
              as="h2"
              className="sec-title"
              delay={60}
              style={{ fontSize: 'clamp(28px,3.6vw,44px)' }}
            >
              Una operación, seis herramientas, <em>cero memoria compartida</em>.
            </Reveal>
            <ul className="prob-list">
              {items.map((it, i) => (
                <Reveal as="li" className="prob-item" key={it[1]} delay={80 + i * 60}>
                  <span className="prob-ic">
                    <Icon name={it[0]} size={17} />
                  </span>
                  <div>
                    <h4>{it[1]}</h4>
                    <p>{it[2]}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
          <Reveal className="scatter" delay={120} aria-hidden>
            {chips.map((c) => (
              <span
                className="chip muted"
                key={c.t}
                style={{ left: c.x, top: c.y, transform: `rotate(${c.r})` }}
              >
                <Icon name={c.ic} size={15} /> {c.t}
              </span>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// CICLO — scrollytelling de 6 etapas + closing binder
// ───────────────────────────────────────────────────────────────────────────────
function QR({ size = 64 }: { size?: number }) {
  const n = 21;
  const cell = 100 / n;
  let seed = 0x9e37;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 8) / 0x7fffff;
  };
  const rects: ReactNode[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (finder) continue;
      if (rnd() > 0.52)
        rects.push(
          <rect
            key={x + '-' + y}
            x={x * cell}
            y={y * cell}
            width={cell * 1.02}
            height={cell * 1.02}
            fill="#16120b"
          />,
        );
    }
  const Finder = ({ tx, ty }: { tx: number; ty: number }) => (
    <g transform={`translate(${tx},${ty})`}>
      <rect width={cell * 7} height={cell * 7} fill="#16120b" />
      <rect x={cell} y={cell} width={cell * 5} height={cell * 5} fill="#fff" />
      <rect x={cell * 2} y={cell * 2} width={cell * 3} height={cell * 3} fill="#16120b" />
    </g>
  );
  return (
    <svg viewBox="0 0 100 100" aria-hidden style={{ width: size, height: size }}>
      <rect width="100" height="100" fill="#fff" />
      {rects}
      <Finder tx={0} ty={0} />
      <Finder tx={cell * 14} ty={0} />
      <Finder tx={0} ty={cell * 14} />
    </svg>
  );
}

function Avatars({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex' }}>
      {items.map((a, i) => (
        <span
          key={i}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            marginLeft: i ? -8 : 0,
            background: 'var(--teal-soft)',
            color: 'var(--teal)',
            border: '1.5px solid var(--ink-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10.5,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {a}
        </span>
      ))}
    </div>
  );
}

function StageIntake() {
  return (
    <Win url="lawzora.app/operaciones/nueva" urlIcon="FolderPlus" className="stage-win">
      <div className="stage-body sb">
        <div className="panel-h" style={{ margin: 0, marginBottom: 14 }}>
          <div>
            <div className="panel-title">Nueva operación</div>
            <div className="panel-sub">Crear expediente y partes</div>
          </div>
          <Tag tone="teal" icon="Sparkles">
            Datos verificados
          </Tag>
        </div>
        <div className="sb-cols" style={{ gap: 12 }}>
          <div>
            <div className="lbl">Cliente</div>
            <div className="field">Inversiones Marbella, S.L.</div>
          </div>
          <div className="field-row">
            <div>
              <div className="lbl">Tipo de operación</div>
              <div className="seg">
                <span className="on">Compraventa de participaciones</span>
                <span>Inmobiliario</span>
              </div>
            </div>
            <div>
              <div className="lbl">Jurisdicción</div>
              <div className="seg">
                <span className="on">España</span>
                <span>Rep. Dominicana</span>
              </div>
            </div>
          </div>
          <div className="field-row">
            <div>
              <div className="lbl">Contraparte</div>
              <div className="field">TechVentures, S.L.</div>
            </div>
            <div>
              <div className="lbl">CIF</div>
              <div className="field mono">B-87654321</div>
            </div>
          </div>
          <div className="field-row">
            <div>
              <div className="lbl">Importe de la operación</div>
              <div className="field mono">4.200.000,00 €</div>
            </div>
            <div>
              <div className="lbl">Equipo</div>
              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatars items={['LM', 'CR', 'AS']} />
                <span style={{ color: 'var(--mut)', fontSize: 12 }}>3 asignados</span>
              </div>
            </div>
          </div>
        </div>
        <div className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} aria-hidden>
          Crear operación <Icon name="ArrowRight" size={15} />
        </div>
      </div>
    </Win>
  );
}

function StageEncargo() {
  return (
    <Win url="lawzora.app/op/OP-2026-014/encargo" urlIcon="FileSignature" className="stage-win">
      <div className="stage-body sb">
        <div className="paper" style={{ height: '100%' }}>
          <div className="paper-pad">
            <div className="paper-head">
              <div>
                <div className="paper-kicker">Hoja de encargo · OP-2026-014</div>
                <div className="paper-h">Adquisición de TechVentures, S.L.</div>
              </div>
              <span className="sign-pill">
                <Icon name="Check" size={12} /> Firmada
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="paper-row">
                <span className="k">Alcance</span>
                <span className="v" style={{ fontFamily: 'var(--font-sans)' }}>
                  Due diligence, redacción y cierre
                </span>
              </div>
              <div className="paper-row">
                <span className="k">Honorarios fijos</span>
                <span className="v">18.000,00 €</span>
              </div>
              <div className="paper-row">
                <span className="k">Honorario de éxito</span>
                <span className="v">1,5% del precio</span>
              </div>
              <div className="paper-row">
                <span className="k">Provisión de fondos</span>
                <span className="v">6.000,00 €</span>
              </div>
            </div>
            <div className="sign-line">
              <span className="sign-mark">Inversiones&nbsp;Marbella</span>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div className="paper-mut" style={{ fontSize: 11 }}>
                  Firma electrónica · 14 jun 2026, 12:04
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--paper-mut)' }}>
                  sha256 · 7f3a…c91e
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Win>
  );
}

function StageRedline() {
  return (
    <Win url="lawzora.app/op/OP-2026-014/contrato" urlIcon="GitCompareArrows" className="stage-win">
      <div className="stage-body sb">
        <div className="panel-h" style={{ margin: 0, marginBottom: 12 }}>
          <div>
            <div className="panel-title">Contrato de compraventa (SPA)</div>
            <div className="panel-sub">redline · v4 → v5</div>
          </div>
          <Tag tone="info" icon="Pencil">
            2 cambios
          </Tag>
        </div>
        <div className="sb-2col">
          <div>
            <div className="lbl">Biblioteca de cláusulas</div>
            <div className="clauses">
              <div className="clause">
                <Icon name="GripVertical" size={13} className="grip" /> Manifestaciones y garantías
              </div>
              <div className="clause">
                <Icon name="GripVertical" size={13} className="grip" /> Condiciones suspensivas
              </div>
              <div className="clause added">
                <Icon name="Plus" size={13} /> Pacto de no competencia · añadida
              </div>
              <div className="clause">
                <Icon name="GripVertical" size={13} className="grip" /> Indemnización (caps &amp;
                baskets)
              </div>
              <div className="clause">
                <Icon name="GripVertical" size={13} className="grip" /> Ley aplicable y jurisdicción
              </div>
            </div>
          </div>
          <div>
            <div className="lbl">Cláusula 8.2 — Precio</div>
            <div
              className="redline"
              style={{
                border: '1px solid var(--line)',
                borderRadius: 9,
                padding: '11px 12px',
                background: 'var(--fill)',
                height: 'calc(100% - 22px)',
              }}
            >
              El precio de compraventa asciende a <span className="del">3.900.000 €</span>{' '}
              <span className="ins">4.200.000 €</span>, pagadero{' '}
              <span className="cur">en la fecha de cierre</span> mediante transferencia. El{' '}
              <span className="ins">15%</span> quedará retenido en cuenta escrow durante{' '}
              <span className="del">12</span> <span className="ins">18</span> meses como garantía de
              las manifestaciones.
            </div>
          </div>
        </div>
      </div>
    </Win>
  );
}

function StageDataRoom() {
  const folders: [string, number][] = [
    ['01 Societario', 28],
    ['02 Financiero', 41],
    ['03 Laboral', 17],
    ['04 Fiscal', 22],
    ['05 Inmobiliario', 19],
    ['06 Contratos', 15],
  ];
  return (
    <Win url="lawzora.app/op/OP-2026-014/data-room" urlIcon="DatabaseZap" className="stage-win">
      <div className="stage-body sb">
        <div className="panel-h" style={{ margin: 0, marginBottom: 12 }}>
          <div>
            <div className="panel-title">Data room · Due diligence</div>
            <div className="panel-sub">142 documentos · 6 carpetas</div>
          </div>
          <Tag tone="teal" icon="Lock">
            Acceso registrado
          </Tag>
        </div>
        <div className="sb-2col">
          <div className="tree">
            {folders.map((f) => (
              <div className="tnode" key={f[0]}>
                <Icon name="Folder" size={15} className="tn-ic" /> {f[0]}{' '}
                <span className="tn-c">{f[1]}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="lbl">Actividad de acceso</div>
            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 9,
                padding: 11,
                background: 'var(--fill)',
              }}
            >
              {[
                ['C. Ruiz · descargó', '02-Financiero/EEFF-2025.pdf', '14:02'],
                ['Comprador · vio', '01-Societario/Escritura.pdf', '11:48'],
                ['A. Soler · subió', '04-Fiscal/Modelo-200.pdf', 'ayer'],
              ].map((l, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: '7px 0',
                    borderBottom: i < 2 ? '1px solid var(--line)' : 0,
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>{l[0]}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>
                    {l[1]} · {l[2]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Win>
  );
}

function StageChecklist() {
  const items: [string, string, boolean][] = [
    ['Aprobación de la junta de socios', 'CP-01 · 28 jun', true],
    ['Waiver de la entidad financiera', 'CP-02 · 02 jul', true],
    ['Certificado de cargas registral', 'CP-03 · 04 jul', true],
    ['Consentimiento de cambio de control', 'CP-04 · pendiente', false],
    ['Firma del SPA ante notario', 'Cierre · 12 jul', false],
  ];
  const done = items.filter((i) => i[2]).length;
  return (
    <Win url="lawzora.app/op/OP-2026-014/cierre" urlIcon="ListChecks" className="stage-win">
      <div className="stage-body sb">
        <div className="panel-h" style={{ margin: 0, marginBottom: 10 }}>
          <div>
            <div className="panel-title">Checklist de cierre</div>
            <div className="panel-sub">condiciones suspensivas</div>
          </div>
          <Tag tone="warn" icon="Clock">
            Cierre 12 jul
          </Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div className="progbar" style={{ flex: 1 }}>
            <i style={{ width: (done / items.length) * 100 + '%' }} />
          </div>
          <span className="mono" style={{ fontSize: 12, color: 'var(--teal)' }}>
            {done}/{items.length}
          </span>
        </div>
        <div>
          {items.map((it) => (
            <div className={`check ${it[2] ? 'done' : 'pend'}`} key={it[0]}>
              <span className="check-box">
                <Icon name={it[2] ? 'Check' : 'Clock'} size={12} />
              </span>
              <div>
                <div className="check-t">{it[0]}</div>
                <div className="check-m">{it[1]}</div>
              </div>
              <span className="at">
                {it[2] ? <Tag tone="ok">Cumplida</Tag> : <Tag tone="warn">Pendiente</Tag>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Win>
  );
}

function StageFactura() {
  return (
    <Win url="lawzora.app/op/OP-2026-014/factura" urlIcon="ShieldCheck" className="stage-win">
      <div className="stage-body sb">
        <div className="paper" style={{ height: '100%', overflow: 'auto' }}>
          <div className="paper-pad">
            <div className="paper-head">
              <div>
                <div className="paper-kicker">Factura FAC-2026-0042</div>
                <div className="paper-h">Honorarios · cierre de operación</div>
              </div>
              <span className="sign-pill">
                <Icon name="Check" size={12} /> Emitida
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="paper-row">
                <span className="k">Honorarios fijos</span>
                <span className="v">18.000,00 €</span>
              </div>
              <div className="paper-row">
                <span className="k">Honorario de éxito (1,5%)</span>
                <span className="v">63.000,00 €</span>
              </div>
              <div className="paper-row">
                <span className="k">IVA (21%) · IRPF (−15%)</span>
                <span className="v">+ 4.860,00 €</span>
              </div>
              <div className="paper-row total">
                <span>Total</span>
                <span className="v">85.860,00 €</span>
              </div>
            </div>
            <div className="fiscal">
              <div className="fiscal-head">
                <Icon name="ShieldCheck" size={14} /> Registro fiscal{' '}
                <span className="fiscal-badge">Verifactu · AEAT</span>
              </div>
              <div className="fiscal-body">
                <div className="qr">
                  <QR />
                </div>
                <div className="fiscal-rows">
                  <div>
                    <div className="fiscal-k">Huella (hash)</div>
                    <div className="fiscal-v">
                      cfb811ec563a303e2b41a41d47f6e59cf6ec1296e0e8df304b49fd25972b0f62
                    </div>
                  </div>
                  <div className="fiscal-chain">
                    <Icon name="Check" size={13} /> Huella encadenada e inmutable
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Win>
  );
}

type Stage = { n: string; key: string; title: string; desc: string; Comp: () => JSX.Element };
const STAGES: Stage[] = [
  {
    n: '01',
    key: 'intake',
    title: 'Intake',
    desc: 'Alta de la operación, cliente y partes.',
    Comp: StageIntake,
  },
  {
    n: '02',
    key: 'encargo',
    title: 'Hoja de encargo',
    desc: 'Alcance, honorarios y firma electrónica.',
    Comp: StageEncargo,
  },
  {
    n: '03',
    key: 'redline',
    title: 'Redacción y redline',
    desc: 'Cláusulas, ensamblado y control de cambios.',
    Comp: StageRedline,
  },
  {
    n: '04',
    key: 'dataroom',
    title: 'Data room',
    desc: 'Due diligence con índice y acceso registrado.',
    Comp: StageDataRoom,
  },
  {
    n: '05',
    key: 'cierre',
    title: 'Checklist de cierre',
    desc: 'Condiciones suspensivas y firmas.',
    Comp: StageChecklist,
  },
  {
    n: '06',
    key: 'factura',
    title: 'Factura y cumplimiento',
    desc: 'Verifactu / e-CF con huella y QR de cotejo.',
    Comp: StageFactura,
  },
];

type BinderRow = { n: string; t: string; pg: number; copper?: boolean };
const BINDER: BinderRow[] = [
  { n: '01', t: 'Carátula y partes', pg: 4 },
  { n: '02', t: 'Hoja de encargo', pg: 6 },
  { n: '03', t: 'Contrato (SPA) firmado', pg: 38 },
  { n: '04', t: 'Due diligence · índice', pg: 84 },
  { n: '05', t: 'Certificados de cierre', pg: 12 },
  { n: '06', t: 'Factura y cumplimiento', pg: 4, copper: true },
];

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

function BinderTray({ active }: { active: number }) {
  const filledCount = active + 1;
  const totalPages = BINDER.slice(0, filledCount).reduce((s, b) => s + b.pg, 0);
  const pages = useCountUp(totalPages, 550);
  const allDone = active >= STAGES.length - 1;
  return (
    <div className="binder">
      <div className="binder-head">
        <span className="binder-title">
          <Icon name="BookMarked" size={16} /> Closing binder{' '}
          {allDone && <span style={{ color: 'var(--teal)', fontWeight: 500 }}>· completo</span>}
        </span>
        <span className="binder-count">
          <b>{pages}</b> págs · {filledCount}/{BINDER.length} secciones
        </span>
      </div>
      <div className="tabs">
        {BINDER.map((b, i) => {
          const filled = i <= active;
          const just = i === active;
          return (
            <div
              key={b.n}
              className={`btab ${filled ? 'filled' : ''} ${b.copper ? 'copper' : ''}`.trim()}
              style={
                just && filled
                  ? {
                      boxShadow: b.copper
                        ? '0 0 0 2px var(--copper-line), 0 10px 26px -12px rgba(190,120,40,0.6)'
                        : '0 0 0 2px var(--teal-line), 0 10px 22px -14px oklch(0 0 0 / 0.8)',
                    }
                  : undefined
              }
            >
              <span className="btab-check">
                <Icon name="Check" size={13} />
              </span>
              <span className="btab-n">{b.n}</span>
              <span className="btab-t">{b.t}</span>
              <span className="btab-pg">{filled ? `${b.pg} pág` : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CycleSection() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const [fill, setFill] = useState(0);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const vh = window.innerHeight;
      const scrolled = -rect.top;
      const span = track.offsetHeight - vh;
      const p = span > 0 ? Math.min(1, Math.max(0, scrolled / span)) : 0;
      setFill(p);
      const idx = Math.min(STAGES.length - 1, Math.floor(p * STAGES.length - 1e-6));
      setActive(idx < 0 ? 0 : idx);
    };
    const handler = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          onScroll();
          ticking = false;
        });
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler);
    onScroll();
    return () => {
      window.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, []);

  const jump = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const vh = window.innerHeight;
    const span = track.offsetHeight - vh;
    const top = track.offsetTop + ((i + 0.5) / STAGES.length) * span;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <section className="cycle" id="ciclo">
      <div className="cycle-intro wrap">
        <span className="eyebrow">
          <span className="dot" /> El ciclo de la operación
        </span>
        <h2 className="sec-title" style={{ maxWidth: '20ch', margin: '18px auto 0' }}>
          Una operación, <em>de principio a cierre</em>.
        </h2>
        <p className="sec-lead" style={{ maxWidth: '54ch', margin: '18px auto 0' }}>
          Cada etapa alimenta a la siguiente y el <b>closing binder se ensambla solo</b>, página a
          página, mientras trabajas. Desliza para recorrerla.
        </p>
      </div>

      <div
        className="cycle-track"
        ref={trackRef}
        style={{ height: `${STAGES.length * 80 + 20}vh` }}
      >
        <div className="wrap" style={{ height: '100%' }}>
          <div className="cycle-sticky">
            <div className="rail">
              <div className="rail-prog">
                <i style={{ height: `${fill * 100}%` }} />
              </div>
              {STAGES.map((s, i) => (
                <div
                  key={s.key}
                  className={`rail-item ${i === active ? 'active' : ''} ${i < active ? 'done' : ''}`.trim()}
                  onClick={() => jump(i)}
                >
                  <span className="rail-dot">
                    {i < active ? <Icon name="Check" size={13} /> : s.n}
                  </span>
                  <div className="rail-tx">
                    <h5>{s.title}</h5>
                    <p>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="stage-area">
              <div className="stage-frame">
                {STAGES.map((s, i) => (
                  <div
                    key={s.key}
                    className={`stage-pane ${i === active ? 'active' : ''}`.trim()}
                    aria-hidden={i !== active}
                  >
                    <s.Comp />
                  </div>
                ))}
              </div>
              <BinderTray active={active} />
            </div>
          </div>
        </div>
      </div>

      <div className="cycle-stack wrap">
        {STAGES.map((s) => (
          <div className="cstep" key={s.key}>
            <div className="cstep-h">
              <span className="cstep-n">{s.n}</span>
              <div>
                <h5>{s.title}</h5>
                <p>{s.desc}</p>
              </div>
            </div>
            <div className="stage-frame">
              <div className="stage-pane active">
                <s.Comp />
              </div>
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 26 }}>
          <BinderTray active={STAGES.length - 1} />
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// BENTO
// ───────────────────────────────────────────────────────────────────────────────
function GestionUI() {
  return (
    <div className="t-ui" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
      <div>
        <div className="mini-row">
          <span>
            <span className="mt">Compraventa · TechVentures</span>
            <br />
            <span className="mm">OP-2026-014</span>
          </span>
          <Tag tone="info">Due diligence</Tag>
        </div>
        <div className="mini-row">
          <span>
            <span className="mt">Reestructuración · G. Cádiz</span>
            <br />
            <span className="mm">OP-2026-011</span>
          </span>
          <Tag tone="teal">Redline</Tag>
        </div>
        <div className="mini-row">
          <span>
            <span className="mt">Edificio Recoletos</span>
            <br />
            <span className="mm">OP-2026-009</span>
          </span>
          <Tag tone="warn">Cierre</Tag>
        </div>
        <div className="mini-row">
          <span>
            <span className="mt">Joint venture · Solaria</span>
            <br />
            <span className="mm">OP-2026-007</span>
          </span>
          <Tag tone="ok">Cerrada</Tag>
        </div>
      </div>
      <div className="funnel">
        <div className="funnel-bar">
          <i style={{ width: '100%' }} />
          <b>9</b>
        </div>
        <span className="mm" style={{ fontSize: 10 }}>
          Intake
        </span>
        <div className="funnel-bar">
          <i style={{ width: '70%' }} />
          <b>7</b>
        </div>
        <span className="mm" style={{ fontSize: 10 }}>
          Due diligence
        </span>
        <div className="funnel-bar">
          <i style={{ width: '40%' }} />
          <b>4</b>
        </div>
        <span className="mm" style={{ fontSize: 10 }}>
          En cierre
        </span>
      </div>
    </div>
  );
}

function DocsUI() {
  return (
    <div className="t-ui">
      <div className="tree">
        <div className="tnode">
          <Icon name="Folder" size={14} className="tn-ic" /> 02 Financiero{' '}
          <span className="tn-c">41</span>
        </div>
        <div className="tnode file">
          <Icon name="FileText" size={13} className="tn-ic" /> EEFF-2025.pdf{' '}
          <span className="tn-c">v3</span>
        </div>
        <div className="tnode file">
          <Icon
            name="GitCompareArrows"
            size={13}
            className="tn-ic"
            style={{ color: 'var(--teal)' }}
          />{' '}
          SPA-borrador.docx{' '}
          <span className="tn-c" style={{ color: 'var(--teal)' }}>
            v4 → v5
          </span>
        </div>
      </div>
    </div>
  );
}

function FiscalMiniUI() {
  return (
    <div className="t-ui">
      <div className="mini-row" style={{ borderColor: 'var(--teal-line)' }}>
        <span className="mt" style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
          <Icon name="ShieldCheck" size={14} style={{ color: 'var(--teal)' }} /> Verifactu · AEAT
        </span>
        <Tag tone="ok" icon="Check">
          Conforme
        </Tag>
      </div>
      <div className="mini-row">
        <span className="mt">eNCF · DGII</span>
        <span className="mm">E310000000007</span>
      </div>
      <div className="mini-row">
        <span className="mt">Huella encadenada</span>
        <span className="mm">cfb811…b0f62</span>
      </div>
    </div>
  );
}

function CobrosUI() {
  return (
    <div className="t-ui">
      <div className="mini-row">
        <span className="mt">Pendiente de cobro</span>
        <span className="mm" style={{ fontSize: 13, color: 'var(--teal)' }}>
          85.860,00 €
        </span>
      </div>
      <div className="mini-row">
        <span className="mt">Provisión de fondos</span>
        <Tag tone="warn">Solicitada</Tag>
      </div>
      <div className="mini-row">
        <span className="mt">Pago · Stripe</span>
        <Tag tone="ok">Cobrado</Tag>
      </div>
    </div>
  );
}

function AiUI() {
  return (
    <div className="t-ui">
      <div className="ai-bubble">
        <span className="ai-q">¿Qué plazo de escrow pactamos?</span>
        <br />
        18 meses sobre el 15% del precio{' '}
        <span className="cite">
          <Icon name="FileText" size={9} /> SPA 8.2
        </span>
        <div className="conf">
          <div className="progbar">
            <i style={{ width: '92%' }} />
          </div>
          <b>92%</b>
        </div>
      </div>
    </div>
  );
}

function PortalUI() {
  return (
    <div className="t-ui" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div>
        <div className="mm" style={{ marginBottom: 7 }}>
          Portal del cliente
        </div>
        <div className="mini-row">
          <span className="mt">Mis facturas</span>
          <Icon name="ChevronRight" size={14} style={{ color: 'var(--faint)' }} />
        </div>
        <div className="mini-row">
          <span className="mt">Documentos</span>
          <Icon name="ChevronRight" size={14} style={{ color: 'var(--faint)' }} />
        </div>
      </div>
      <div>
        <div className="mm" style={{ marginBottom: 7 }}>
          Seguridad
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Tag tone="teal" icon="Lock">
            MFA
          </Tag>
          <Tag tone="teal" icon="ShieldCheck">
            AES-256
          </Tag>
          <Tag tone="teal" icon="Users">
            RLS
          </Tag>
        </div>
      </div>
    </div>
  );
}

const TILES = [
  {
    cls: 't-big',
    label: 'Gestión',
    title: 'Cada operación, de un vistazo',
    desc: 'Expedientes, clientes, equipo y plazos en un pipeline que sabes leer en segundos.',
    UI: GestionUI,
  },
  {
    cls: 't-sm',
    label: 'Documentos & data room',
    title: 'Versiones, redline y due diligence',
    desc: 'Biblioteca de cláusulas, control de versiones y un data room con acceso registrado.',
    UI: DocsUI,
  },
  {
    cls: 't-sm',
    label: 'Cumplimiento fiscal',
    title: 'Verifactu y e-CF nativos',
    desc: 'Registro fiscal encadenado y conforme; la transmisión se activa en el onboarding fiscal.',
    UI: FiscalMiniUI,
  },
  {
    cls: 't-third',
    label: 'Cobros & finanzas',
    title: 'Cobra antes',
    desc: 'Pago con tarjeta, provisión de fondos y saldo por expediente.',
    UI: CobrosUI,
  },
  {
    cls: 't-third',
    label: 'Asistente IA',
    title: 'Con citas y confianza',
    desc: 'Redacta y responde sobre tus documentos, siempre con la fuente.',
    UI: AiUI,
  },
  {
    cls: 't-third',
    label: 'Portal & seguridad',
    title: 'Tu cliente, en su espacio',
    desc: 'Portal del cliente y seguridad multi-tenant de serie.',
    UI: PortalUI,
  },
];

function Bento() {
  return (
    <section className="sec" id="producto">
      <div className="wrap">
        <div className="sec-head center">
          <Reveal as="span" className="eyebrow" style={{ justifyContent: 'center' }}>
            <span className="dot" /> Todo el despacho transaccional
          </Reveal>
          <Reveal as="h2" className="sec-title" delay={60}>
            Seis áreas, <em>una sola herramienta</em>.
          </Reveal>
          <Reveal as="p" className="sec-lead" delay={120} style={{ marginInline: 'auto' }}>
            Del intake al cierre y la factura, sin exportar, sin integraciones a medias y sin perder
            el hilo de la operación.
          </Reveal>
        </div>
        <div className="bento">
          {TILES.map((t, i) => (
            <Reveal className={`tile ${t.cls}`} key={t.title} delay={i * 70}>
              <span className="t-label">{t.label}</span>
              <h3>{t.title}</h3>
              <p>{t.desc}</p>
              <t.UI />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// DIFERENCIADOR FISCAL (ES/RD)
// ───────────────────────────────────────────────────────────────────────────────
const REGIME = {
  es: {
    badge: 'Verifactu · AEAT',
    k: 'Huella (hash)',
    v: 'cfb811ec563a303e2b41a41d47f6e59cf6ec1296e0e8df304b49fd25972b0f62',
    org: 'AEAT',
  },
  rd: { badge: 'e-CF · DGII', k: 'eNCF', v: 'E310000000007', org: 'DGII' },
};

function FiscalDiff() {
  const [reg, setReg] = useState<'es' | 'rd'>('es');
  const r = REGIME[reg];
  return (
    <section className="fiscal-band" id="cumplimiento">
      <div className="wrap sec">
        <div className="fiscal-grid">
          <div>
            <Reveal as="span" className="eyebrow copper">
              <span className="dot" /> Cumplimiento fiscal nativo
            </Reveal>
            <Reveal as="h2" className="sec-title" delay={60}>
              El foso: facturar <em>en regla</em>, no después.
            </Reveal>
            <Reveal as="p" className="sec-lead" delay={100}>
              La facturación electrónica es <b>obligatoria</b> — Verifactu en España y e-CF en R.
              Dominicana. Lawzora la emite con su <b>registro fiscal encadenado</b> y su QR de
              cotejo; la transmisión a {r.org} se activa en tu onboarding fiscal, sin un segundo programa.
            </Reveal>
            <Reveal className="jur-toggle" delay={140} role="tablist" aria-label="Régimen fiscal">
              <button
                type="button"
                role="tab"
                className={reg === 'es' ? 'on' : ''}
                onClick={() => setReg('es')}
                aria-selected={reg === 'es'}
              >
                <Icon name="Landmark" size={14} /> Verifactu · ES
              </button>
              <button
                type="button"
                role="tab"
                className={reg === 'rd' ? 'on' : ''}
                onClick={() => setReg('rd')}
                aria-selected={reg === 'rd'}
              >
                <Icon name="Landmark" size={14} /> e-CF · RD
              </button>
            </Reveal>
            <ul className="fiscal-points">
              <li>
                <span className="fi">
                  <Icon name="Link2" size={13} />
                </span>
                <span>
                  <b>Huella encadenada e inmutable.</b> Cada factura referencia la anterior — la
                  cadena prueba que no se altera.
                </span>
              </li>
              <li>
                <span className="fi">
                  <Icon name="QrCode" size={13} />
                </span>
                <span>
                  <b>QR de cotejo</b> en cada factura, ligado a su huella encadenada.
                </span>
              </li>
              <li>
                <span className="fi">
                  <Icon name="ShieldCheck" size={13} />
                </span>
                <span>
                  Generación y encadenamiento <b>ya conformes</b>; la transmisión se activa en el
                  onboarding fiscal.
                </span>
              </li>
            </ul>
          </div>
          <Reveal className="fiscal-stage" delay={120}>
            <div className="paper">
              <div className="paper-pad">
                <div className="paper-head">
                  <div>
                    <div className="paper-kicker">Factura FAC-2026-0042 · {r.badge}</div>
                    <div className="paper-h">Honorarios · cierre de operación</div>
                  </div>
                  <span className="sign-pill">
                    <Icon name="Check" size={12} /> Emitida
                  </span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div className="paper-row">
                    <span className="k">Base imponible</span>
                    <span className="v">81.000,00 €</span>
                  </div>
                  <div className="paper-row">
                    <span className="k">
                      {reg === 'es' ? 'IVA (21%) · IRPF (−15%)' : 'ITBIS (18%)'}
                    </span>
                    <span className="v">{reg === 'es' ? '+ 4.860,00 €' : '+ 14.580,00 €'}</span>
                  </div>
                  <div className="paper-row total">
                    <span>Total</span>
                    <span className="v">{reg === 'es' ? '85.860,00 €' : 'RD$ 5.612.400,00'}</span>
                  </div>
                </div>
                <div className="fiscal lg">
                  <div className="fiscal-head">
                    <Icon name="ShieldCheck" size={15} /> Registro fiscal{' '}
                    <span className="fiscal-badge">{r.badge}</span>
                  </div>
                  <div className="fiscal-body">
                    <div className="qr">
                      <QR />
                    </div>
                    <div className="fiscal-rows">
                      <div>
                        <div className="fiscal-k">{r.k}</div>
                        <div className="fiscal-v">{r.v}</div>
                      </div>
                      <div>
                        <div className="fiscal-k">Encadenamiento (huella anterior)</div>
                        <div className="fiscal-v">
                          1741e68a6cf8a5beba9b8b603d06245d0c3050e085f65347237dfa1ac1d678ae
                        </div>
                      </div>
                      <div className="fiscal-chain">
                        <Icon name="Check" size={13} /> Huella encadenada e inmutable
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// JURISDICCIÓN
// ───────────────────────────────────────────────────────────────────────────────
type Jur = { code: string; name: string; sub: string; rows: [string, string][] };
const JUR: Record<'es' | 'rd', Jur> = {
  es: {
    code: 'ES',
    name: 'España',
    sub: 'es-ES · zona euro',
    rows: [
      ['Identificador', 'NIF / CIF / NIE'],
      ['Impuestos', 'IVA 21% · IRPF'],
      ['Factura electrónica', 'Verifactu · AEAT'],
      ['Moneda', 'EUR €'],
    ],
  },
  rd: {
    code: 'RD',
    name: 'República Dominicana',
    sub: 'es-DO',
    rows: [
      ['Identificador', 'RNC / Cédula'],
      ['Impuestos', 'ITBIS 18%'],
      ['Factura electrónica', 'e-CF · DGII (eNCF)'],
      ['Moneda', 'DOP RD$ · USD'],
    ],
  },
};

function JurCard({ j }: { j: Jur }) {
  return (
    <div className="jur-card">
      <div className="jur-head">
        <span
          className="jur-flag mono"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}
        >
          {j.code}
        </span>
        <div>
          <h4>{j.name}</h4>
          <p>{j.sub}</p>
        </div>
      </div>
      <div className="jur-rows">
        {j.rows.map((r) => (
          <div className="jur-r" key={r[0]}>
            <span className="k">{r[0]}</span>
            <span className="v">{r[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Jurisdiction() {
  return (
    <section className="sec" id="jurisdicciones">
      <div className="wrap">
        <div className="sec-head center">
          <Reveal as="span" className="eyebrow" style={{ justifyContent: 'center' }}>
            <span className="dot" /> Multi-jurisdicción · multi-moneda
          </Reveal>
          <Reveal as="h2" className="sec-title" delay={60}>
            Un despacho en ES, en RD <em>o en ambos</em>.
          </Reveal>
          <Reveal as="p" className="sec-lead" delay={120} style={{ marginInline: 'auto' }}>
            Una sola cuenta surface los identificadores, impuestos, factura y moneda correctos según
            la jurisdicción. Nunca mezclamos monedas en un mismo importe.
          </Reveal>
        </div>
        <div className="jur-cols">
          <Reveal delay={60}>
            <JurCard j={JUR.es} />
          </Reveal>
          <Reveal delay={140}>
            <JurCard j={JUR.rd} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SEGURIDAD
// ───────────────────────────────────────────────────────────────────────────────
const SEC: [string, string, string, string][] = [
  [
    'Users',
    'Aislamiento RLS fail-closed',
    'Multi-tenant a nivel de fila: si la política no concede acceso explícito, deniega.',
    'row-level security · deny by default',
  ],
  [
    'ShieldCheck',
    'Cifrado AES-256',
    'En tránsito con TLS y en reposo en la base de datos, en todo momento.',
    'AES-256-GCM · TLS 1.3',
  ],
  [
    'FileLock2',
    'RGPD (ES) y Ley 172-13 (RD)',
    'Protección de datos conforme en ambas jurisdicciones, con export y anonimización.',
    'export · derecho de supresión',
  ],
  [
    'KeyRound',
    'MFA y acceso por roles',
    'Doble factor y permisos por rol; cada persona ve solo lo que le corresponde.',
    'TOTP · SSO',
  ],
  [
    'History',
    'Auditoría inmutable',
    'Cada acción queda registrada y encadenada — trazable y a prueba de manipulación.',
    'append-only · hash chain',
  ],
  [
    'DatabaseBackup',
    'Copias y recuperación',
    'Backups cifrados y recuperación ante incidentes con objetivos de tiempo estrictos.',
    'backups cifrados · RPO bajo',
  ],
];

function Security() {
  return (
    <section className="sec-band" id="seguridad">
      <div className="wrap sec">
        <div className="sec-head">
          <Reveal as="span" className="eyebrow">
            <span className="dot" /> Seguridad y datos
          </Reveal>
          <Reveal
            as="h2"
            className="sec-title"
            delay={60}
            style={{ fontSize: 'clamp(28px,3.6vw,44px)' }}
          >
            Información sensible, <em>tratada como tal</em>.
          </Reveal>
        </div>
        <div className="sec-grid">
          {SEC.map((s, i) => (
            <Reveal className="sec-card" key={s[1]} delay={i * 60}>
              <span className="si">
                <Icon name={s[0]} size={18} />
              </span>
              <h4>{s[1]}</h4>
              <p>{s[2]}</p>
              <div className="mono-tag">{s[3]}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// PRECIOS — catálogo canónico real + cupo Fundador en vivo
// ───────────────────────────────────────────────────────────────────────────────
const CYCLES: PlanCycle[] = ['MONTHLY', 'ANNUAL', 'BIENNIAL'];
const CYCLE_LABEL: Record<PlanCycle, string> = {
  MONTHLY: 'Mensual',
  ANNUAL: 'Anual',
  BIENNIAL: 'Bienal',
};

function eur(amount: number): string {
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}
function pct(n: number): string {
  return new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(n);
}

/** Descripciones y ventajas por tier (copy del diseño; el id mapea al catálogo canónico). */
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

function Pricing() {
  const [cycle, setCycle] = useState<PlanCycle>('ANNUAL');
  const founder = useFounderStatus();
  // Catálogo resuelto en EUR (mercado por defecto de la landing).
  const catalog = buildPlanCatalog({}, [Currency.EUR]);
  const rowFor = (plan: string) => catalog.find((r) => r.plan === plan && r.cycle === cycle);
  const founderCycle: PlanCycle = cycle === 'MONTHLY' ? 'ANNUAL' : cycle;
  const founderRow = catalog.find((r) => r.plan === 'FOUNDER' && r.cycle === founderCycle);

  const slotsLeft = founder.data?.slotsLeft ?? null;
  const cap = founder.data?.cap ?? FOUNDER.cap;
  const taken = slotsLeft === null ? null : cap - slotsLeft;
  const left = useCountUp(slotsLeft ?? cap, 700);
  const founderOpen = slotsLeft === null || slotsLeft > 0;

  const billNote = (cy: PlanCycle, save: number): string => {
    if (cy === 'MONTHLY') return 'facturado mensual';
    if (cy === 'ANNUAL') return `−${pct(save)}% · facturado anual · 2 meses gratis`;
    return `−${pct(save)}% · facturado cada 2 años`;
  };

  return (
    <section className="sec" id="precios">
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
          <Reveal className="price-toggle" delay={160} role="tablist" aria-label="Periodicidad">
            {CYCLES.map((c) => {
              const save =
                catalog.find((r) => r.plan === 'PROFESIONAL' && r.cycle === c)?.savingsPct ?? 0;
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
                    <span className="amt mono">{eur(row.perSeatMonthly)}</span>
                    <span className="per">/ usuario / mes</span>
                  </div>
                  <div className="tier-bill">{billNote(cycle, row.savingsPct)}</div>
                  <ul>
                    {copy.feats.map((f, fi) => {
                      const isHeader = fi === 0 && f.startsWith('Todo');
                      return (
                        <li
                          key={f}
                          style={isHeader ? { color: 'var(--mut)', fontWeight: 500 } : undefined}
                        >
                          {!isHeader && <Icon name="Check" size={15} />}
                          {f}
                        </li>
                      );
                    })}
                  </ul>
                  <CtaLink href={SIGNUP} variant={tier.popular ? 'primary' : 'outline'} lg>
                    {copy.cta}
                    {tier.popular && <Icon name="ArrowRight" size={15} />}
                  </CtaLink>
                </div>
              </Reveal>
            );
          })}
        </div>

        {founderOpen && founderRow && (
          <Reveal className="founder">
            <div className="founder-grid">
              <div>
                <span className="eyebrow founder-eyebrow">
                  <span className="dot" style={{ background: 'var(--copper-2)' }} /> Cupo fundador
                </span>
                <h3>
                  Sé uno de los <em>primeros {cap} despachos</em>.
                </h3>
                <p className="founder-lead">
                  Entra con la tarifa fundador y consérvala para siempre. Acceso solo con prepago
                  anual o bienal.
                </p>
                <div className="founder-price">
                  <span className="amt mono">{eur(founderRow.perSeatMonthly)}</span>
                  <span className="note">
                    / usuario / mes · congelado de por vida · funciones Profesional
                  </span>
                </div>
                <ul>
                  {FOUNDER_FEATS.map((f) => (
                    <li key={f}>
                      <Icon name="Check" size={15} /> {f}
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
                <CtaLink
                  href={SIGNUP}
                  lg
                  style={{
                    background: 'var(--copper-2)',
                    color: '#fff',
                    boxShadow: '0 8px 24px -10px rgba(206,138,58,0.5)',
                  }}
                >
                  Reservar plaza fundador <Icon name="ArrowRight" size={15} />
                </CtaLink>
                <div className="fine">Prepago anual o bienal · sin permanencia adicional</div>
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// FAQ
// ───────────────────────────────────────────────────────────────────────────────
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

function Faq() {
  const [open, setOpen] = useState(0);
  return (
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
            <div className={`faq-item ${open === i ? 'open' : ''}`.trim()} key={f[0]}>
              <button
                className="faq-q"
                onClick={() => setOpen(open === i ? -1 : i)}
                aria-expanded={open === i}
              >
                {f[0]}
                <Icon name="Plus" size={19} />
              </button>
              <div className="faq-a">
                <p>{f[1]}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// CTA FINAL + FOOTER
// ───────────────────────────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section className="sec" id="demo" style={{ paddingBottom: 40 }}>
      <div className="wrap">
        <Reveal className="final">
          <h2>
            Del encargo al cierre, <em>en un sitio</em>.
          </h2>
          <p>
            Emite con registro fiscal encadenado y conforme para Verifactu y e-CF, y deja que el
            closing binder se ensamble solo. Crea tu despacho en minutos.
          </p>
          <div className="hero-cta" style={{ marginTop: 30 }}>
            <CtaLink href={SIGNUP} lg>
              Empezar ahora <Icon name="ArrowRight" size={16} />
            </CtaLink>
            <a href="#precios" className="btn btn-outline btn-lg">
              <Icon name="Crown" size={16} /> Reservar plaza fundador
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const FOOT: [string, [string, string][]][] = [
  [
    'Producto',
    [
      ['El ciclo', '#ciclo'],
      ['Funciones', '#producto'],
      ['Cumplimiento', '#cumplimiento'],
      ['Precios', '#precios'],
    ],
  ],
  [
    'Recursos',
    [
      ['Seguridad', '#seguridad'],
      ['Multi-jurisdicción', '#jurisdicciones'],
      ['Preguntas frecuentes', '#faq'],
      ['Iniciar sesión', LOGIN],
    ],
  ],
  [
    'Legal',
    [
      ['Privacidad', '/privacy'],
      ['Términos', '/terms'],
      ['RGPD · Ley 172-13', '#seguridad'],
      ['Contacto', 'mailto:hola@lawzora.com'],
    ],
  ],
];

/** Enlace de footer: usa el router i18n para rutas internas y `<a>` para anclas/mailto. */
function FootLink({ label, href }: { label: string; href: string }) {
  if (href.startsWith('/')) return <Link href={href}>{label}</Link>;
  return <a href={href}>{label}</a>;
}

function Footer() {
  return (
    <footer className="site">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <Logo size={26} />
            <p>
              Software para despachos transaccionales en España y R. Dominicana. Del encargo al
              cierre, en un sitio.
            </p>
          </div>
          {FOOT.map((c) => (
            <div className="foot-col" key={c[0]}>
              <h5>{c[0]}</h5>
              {c[1].map((l) => (
                <FootLink key={l[0]} label={l[0]} href={l[1]} />
              ))}
            </div>
          ))}
        </div>
        <div className="foot-bottom">
          <span>© 2026 Lawzora · lawzora.com</span>
          <span className="foot-lang">
            <Icon name="Globe" size={13} /> Español (ES · DO)
          </span>
        </div>
      </div>
    </footer>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
export function Landing() {
  return (
    <div className="lz-land">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <CycleSection />
        <Bento />
        <FiscalDiff />
        <Jurisdiction />
        <Security />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
