'use client';

import { useTranslations } from 'next-intl';
import { TasksPanel } from '@/components/lexora/tasks-panel';

export default function TasksPage() {
  const t = useTranslations('tasks');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <TasksPanel />
    </div>
  );
}
