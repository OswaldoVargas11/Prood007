'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useAssignMatterLawyer, useAssignees, useChangeMatterStatus, useMatter } from '@/lib/hooks';
import type { MatterDetail } from '@/lib/types';
import { nextStatuses } from '@/lib/matter-status';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/lexora/status-badge';
import { MatterRail } from '@/components/lexora/matter-rail';
import { MatterTeamCard } from '@/components/lexora/matter-team';
import { LegalResearchLinks } from '@/components/lexora/legal-research-links';
import { DocumentsTab } from '@/components/lexora/documents-tab';
import { ClosingChecklistTab } from '@/components/lexora/closing-checklist-tab';
import { DataRoomTab } from '@/components/lexora/data-room-tab';
import { EngagementLetterCard } from '@/components/lexora/engagement-letter-card';
import { TasksPanel } from '@/components/lexora/tasks-panel';
import { CostsTab } from '@/components/lexora/costs-tab';
import { RetainerTab } from '@/components/lexora/retainer';
import { BillingPlansTab } from '@/components/lexora/billing-plans';
import { ChatTab } from '@/components/lexora/chat-tab';
import { MatterEmails } from '@/components/lexora/matter-emails';
import { MatterBudget } from '@/components/lexora/matter-budget';
import { MatterPartiesCard } from '@/components/lexora/matter-parties';
import { MatterTimeline } from '@/components/lexora/matter-timeline';
import { AiAssistantPanel } from '@/components/lexora/ai-assistant-panel';
import { UpgradeNotice } from '@/components/lexora/upgrade-notice';
import { useEntitlement } from '@/lib/entitlements';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function MatterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('matters');
  const tStatus = useTranslations('matters.status');
  const locale = useLocale();
  const { data: matter, isLoading, isError, refetch } = useMatter(id);
  const changeStatus = useChangeMatterStatus(id);
  const searchParams = useSearchParams();
  // Gating por tier: Cierre/Data room/IA se desbloquean en Profesional+ (Avanzado para IA→no, IA es Profesional).
  const canClosing = useEntitlement('closing');
  const canDataRoom = useEntitlement('data-room');
  const canAi = useEntitlement('ai');
  const validTabs = [
    'overview',
    'documents',
    'closing',
    'dataroom',
    'tasks',
    'costs',
    'provision',
    'billing',
    'chat',
    'emails',
    'activity',
  ];
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'overview',
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !matter) {
    return (
      <div className="mx-auto max-w-5xl space-y-3 py-12 text-center">
        <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          {t('retry')}
        </Button>
        <div>
          <Link href="/matters" className="text-sm text-[var(--brand)] hover:underline">
            ← {t('title')}
          </Link>
        </div>
      </div>
    );
  }

  const transitions = nextStatuses(matter.status);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/matters" className="text-sm text-muted-foreground hover:text-foreground">
        ← {t('title')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">{matter.reference}</span>
            <StatusBadge status={matter.status} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{matter.title}</h1>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={transitions.length === 0 || changeStatus.isPending}
            >
              {changeStatus.isPending ? <Loader2 className="animate-spin" /> : null}
              {t('changeStatus')}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {transitions.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => changeStatus.mutate(s)}>
                {tStatus(s)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {changeStatus.isError && <p className="text-sm text-[var(--danger)]">{t('statusError')}</p>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
          <TabsTrigger value="closing">{t('tabs.closing')}</TabsTrigger>
          <TabsTrigger value="dataroom">{t('tabs.dataroom')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('tabs.tasks')}</TabsTrigger>
          <TabsTrigger value="costs">{t('tabs.costs')}</TabsTrigger>
          <TabsTrigger value="provision">{t('tabs.provision')}</TabsTrigger>
          <TabsTrigger value="billing">{t('tabs.billing')}</TabsTrigger>
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
          <TabsTrigger value="emails">{t('tabs.emails')}</TabsTrigger>
          <TabsTrigger value="activity">{t('tabs.activity')}</TabsTrigger>
          <TabsTrigger value="assistant">{t('tabs.assistant')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
              <Card>
                <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field
                    label={t('detail.client')}
                    value={matter.client.name}
                    hint={matter.client.taxId}
                  />
                  <Field label={t('detail.type')} value={matter.type} />
                  <LawyerField matter={matter} />
                  <Field label={t('detail.opened')} value={formatDate(matter.openedAt, locale)} />
                  <Field
                    label={t('detail.closed')}
                    value={matter.closedAt ? formatDate(matter.closedAt, locale) : '—'}
                  />
                </CardContent>
              </Card>
              <div className="space-y-4">
                <MatterRail matterId={id} onOpenLedger={() => setTab('costs')} />
                <MatterTeamCard matterId={id} />
                <MatterBudget matter={matter} />
                <LegalResearchLinks matter={matter} />
              </div>
            </div>
            <MatterPartiesCard matter={matter} />
            <EngagementLetterCard matterId={id} />
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="mb-3 flex justify-end">
            <Link
              href={`/matters/${id}/documents`}
              className="text-sm font-medium text-[var(--brand)] hover:underline"
            >
              {t('openDocuments')} →
            </Link>
          </div>
          <DocumentsTab matterId={id} />
        </TabsContent>

        <TabsContent value="closing">
          {canClosing ? (
            <ClosingChecklistTab matterId={id} />
          ) : (
            <UpgradeNotice feature={t('tabs.closing')} tier="Profesional" />
          )}
        </TabsContent>

        <TabsContent value="dataroom">
          {canDataRoom ? (
            <DataRoomTab matterId={id} />
          ) : (
            <UpgradeNotice feature={t('tabs.dataroom')} tier="Profesional" />
          )}
        </TabsContent>

        <TabsContent value="tasks">
          <TasksPanel matterId={id} />
        </TabsContent>

        <TabsContent value="costs">
          <CostsTab matterId={id} />
        </TabsContent>

        <TabsContent value="provision">
          <RetainerTab matterId={id} />
        </TabsContent>

        <TabsContent value="billing">
          <BillingPlansTab matterId={id} />
        </TabsContent>

        <TabsContent value="chat">
          <ChatTab matterId={id} />
        </TabsContent>

        <TabsContent value="emails">
          <MatterEmails matterId={id} />
        </TabsContent>

        <TabsContent value="activity">
          <MatterTimeline matterId={id} />
        </TabsContent>

        <TabsContent value="assistant">
          {canAi ? (
            <AiAssistantPanel matterId={id} />
          ) : (
            <UpgradeNotice feature={t('tabs.assistant')} tier="Profesional" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Letrado responsable: lectura para todos; el administrador puede asignar/cambiar in situ. */
function LawyerField({ matter }: { matter: MatterDetail }) {
  const t = useTranslations('matters');
  const { hasRole } = useAuth();
  const isAdmin = hasRole('FIRM_ADMIN');
  const assignees = useAssignees(isAdmin);
  const assign = useAssignMatterLawyer(matter.id);

  if (!isAdmin) {
    return <Field label={t('col.lawyer')} value={matter.lawyer?.fullName ?? '—'} />;
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {t('col.lawyer')}
        {assign.isPending && <Loader2 className="size-3 animate-spin" />}
      </div>
      <select
        value={matter.lawyerId ?? ''}
        disabled={assign.isPending || assignees.isLoading}
        onChange={(e) => assign.mutate(e.target.value === '' ? null : e.target.value)}
        className="mt-0.5 flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <option value="">{t('unassigned')}</option>
        {assignees.data?.map((a) => (
          <option key={a.id} value={a.id}>
            {a.fullName}
          </option>
        ))}
      </select>
      {assign.isError && <p className="text-[11px] text-[var(--danger)]">{t('assignError')}</p>}
    </div>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
      {hint && <div className="font-mono text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
