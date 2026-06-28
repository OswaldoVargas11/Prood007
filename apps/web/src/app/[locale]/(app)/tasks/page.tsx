'use client';

import { useTranslations } from 'next-intl';
import { TasksPanel } from '@/components/lexora/tasks-panel';
import { PageHeader } from '@/components/ui/page-header';

export default function TasksPage() {
  const t = useTranslations('tasks');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <TasksPanel />
    </div>
  );
}
