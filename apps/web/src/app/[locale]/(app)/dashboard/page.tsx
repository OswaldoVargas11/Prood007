'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Briefcase,
  CalendarClock,
  FileCheck2,
  Receipt,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useDashboardSummary } from '@/lib/hooks';
import { activityColor, activityLabel, relativeTime } from '@/lib/activity';
import { formatDate, formatMoney } from '@/lib/format';
import type { DashboardSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FirstStepsCard } from '@/components/lexora/first-steps-card';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useDashboardSummary();

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? t('morning') : h < 20 ? t('afternoon') : t('evening');
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/matters">{t('goMatters')}</Link>
        </Button>
      </div>

      {isError && (
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && <DashboardSkeleton />}

      {!isLoading && !isError && data && user && (
        <>
          <FirstStepsCard summary={data} />
          <KpiRow data={data} />
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <RevenueCard data={data} />
            <DigestCard data={data} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <DeadlinesCard data={data} />
            <ActivityCard data={data} />
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={cn('overflow-hidden', className)}>{children}</Card>;
}

function KpiRow({ data }: { data: DashboardSummary }) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const k = data.kpis;
  const items: {
    label: string;
    value: string;
    icon: LucideIcon;
    color: string;
    sub: string;
    delta?: string;
    deltaColor?: string;
  }[] = [
    {
      label: t('kpiActive'),
      value: String(k.activeMatters),
      icon: Briefcase,
      color: 'var(--brand)',
      sub: t('kpiActiveSub', { total: k.totalMatters }),
    },
    {
      label: t('kpiDeadlines'),
      value: String(k.upcomingDeadlines),
      icon: CalendarClock,
      color: 'var(--warning)',
      delta: k.urgentDeadlines > 0 ? String(k.urgentDeadlines) : undefined,
      deltaColor: 'var(--danger)',
      sub: t('urgent'),
    },
    {
      label: t('kpiBillable'),
      value: formatMoney(k.billableThisMonth, data.currency, locale),
      icon: Receipt,
      color: 'var(--success)',
      sub: t('kpiBillableSub', { amount: formatMoney(k.outstanding, data.currency, locale) }),
    },
    {
      label: t('kpiReviews'),
      value: String(k.pendingReviews),
      icon: FileCheck2,
      color: 'var(--info)',
      sub: t('kpiReviewsSub'),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.label}>
            <CardContent className="p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{it.label}</span>
                <span
                  className="flex size-7 items-center justify-center rounded-lg"
                  style={{
                    background: `color-mix(in oklab, ${it.color} 14%, transparent)`,
                    color: it.color,
                  }}
                >
                  <Icon className="size-4" />
                </span>
              </div>
              <div className="text-2xl font-semibold tabular-nums tracking-tight">{it.value}</div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                {it.delta && (
                  <span className="font-semibold tabular-nums" style={{ color: it.deltaColor }}>
                    {it.delta}
                  </span>
                )}
                <span className="text-muted-foreground">{it.sub}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RevenueCard({ data }: { data: DashboardSummary }) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const values = data.revenueByMonth.map((m) => Number(m.total));
  const total = values.reduce((s, v) => s + v, 0);
  const max = Math.max(1, ...values);
  const W = 520;
  const H = 130;
  const step = data.revenueByMonth.length > 1 ? W / (data.revenueByMonth.length - 1) : W;
  const pts = values.map((v, i) => [i * step, H - (v / max) * (H - 16)] as const);
  const line = pts.length
    ? 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')
    : '';
  const area = line ? `${line} L ${W} ${H} L 0 ${H} Z` : '';
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(`${m}-01T00:00:00`));

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-1 flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">{t('revenue')}</div>
            <div className="text-xs text-muted-foreground">{t('revenueSub')}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums tracking-tight">
              {formatMoney(total, data.currency, locale)}
            </div>
          </div>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="140"
          preserveAspectRatio="none"
          className="mt-2 overflow-visible"
        >
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              y1={H * f}
              x2={W}
              y2={H * f}
              stroke="var(--border)"
              strokeWidth="1"
            />
          ))}
          {area && <path d={area} fill="url(#rev)" />}
          {line && (
            <path
              d={line}
              fill="none"
              stroke="var(--brand)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
          {data.revenueByMonth.map((m) => (
            <span key={m.month}>{monthLabel(m.month)}</span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DigestCard({ data }: { data: DashboardSummary }) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const k = data.kpis;
  const bullets: { mark: string; color: string; text: string }[] = [];
  if (k.urgentDeadlines > 0)
    bullets.push({
      mark: '▲',
      color: 'var(--danger)',
      text: t('digestUrgent', { n: k.urgentDeadlines }),
    });
  bullets.push({
    mark: '◆',
    color: 'var(--brand)',
    text: t('digestBillable', {
      billed: formatMoney(k.billableThisMonth, data.currency, locale),
      outstanding: formatMoney(k.outstanding, data.currency, locale),
    }),
  });
  bullets.push({
    mark: '●',
    color: k.pendingReviews > 0 ? 'var(--warning)' : 'var(--success)',
    text: k.pendingReviews > 0 ? t('digestReviews', { n: k.pendingReviews }) : t('digestNoReviews'),
  });

  return (
    <Card
      className="border-[var(--brand-line)]"
      style={{
        background:
          'linear-gradient(160deg, color-mix(in oklab, var(--brand-soft) 60%, var(--card)), var(--card) 65%)',
      }}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-[var(--ai-from)] to-[var(--ai-to)]">
            <Sparkles className="size-3.5 text-white" />
          </span>
          <span className="text-sm font-semibold">{t('digest')}</span>
        </div>
        <div className="flex flex-col gap-2.5">
          {bullets.map((b, i) => (
            <div key={i} className="flex gap-2 text-[13px] leading-snug text-muted-foreground">
              <span style={{ color: b.color }}>{b.mark}</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground/70">{t('digestNote')}</p>
      </CardContent>
    </Card>
  );
}

function deadlineColor(days: number): string {
  if (days <= 2) return 'var(--danger)';
  if (days <= 7) return 'var(--warning)';
  if (days <= 14) return 'var(--info)';
  return 'var(--text-subtle)';
}

function DeadlinesCard({ data }: { data: DashboardSummary }) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">{t('deadlines')}</span>
        {data.urgentCount > 0 && (
          <span className="rounded-md bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--danger)]">
            {data.urgentCount} {t('urgent')}
          </span>
        )}
      </div>
      {data.deadlines.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('noDeadlines')}</p>
      ) : (
        data.deadlines.map((d) => {
          const days = d.dueDate
            ? Math.max(0, Math.ceil((new Date(d.dueDate).getTime() - Date.now()) / 86400000))
            : 0;
          const color = deadlineColor(days);
          const inner = (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="h-7 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{d.deadlineType ?? d.title}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {[d.reference, d.clientName].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold tabular-nums" style={{ color }}>
                  {t('daysLeft', { n: days })}
                </div>
                {d.dueDate && (
                  <div className="text-[10px] text-muted-foreground">
                    {formatDate(d.dueDate, locale)}
                  </div>
                )}
              </div>
            </div>
          );
          return (
            <div key={d.taskId} className="border-b border-border last:border-0">
              {d.matterId ? (
                <Link
                  href={`/matters/${d.matterId}`}
                  className="block transition-colors hover:bg-accent"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </div>
          );
        })
      )}
    </Panel>
  );
}

function ActivityCard({ data }: { data: DashboardSummary }) {
  const t = useTranslations('dashboard');
  return (
    <Panel>
      <div className="border-b border-border px-4 py-3 text-sm font-semibold">{t('activity')}</div>
      {data.recentActivity.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('noActivity')}</p>
      ) : (
        <div className="p-4">
          {data.recentActivity.map((a, i) => (
            <div key={`${a.entityId}-${i}`} className="flex gap-3 pb-3.5 last:pb-0">
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ background: activityColor(a.action) }}
              />
              <div className="min-w-0 flex-1 text-[13px]">
                <span className="font-medium">{a.actor ?? t('system')}</span>{' '}
                <span className="text-muted-foreground">{activityLabel(a.action)}</span>
                <div className="text-[11px] text-muted-foreground">{relativeTime(a.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
