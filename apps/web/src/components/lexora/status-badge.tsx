'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { statusVariant } from '@/lib/matter-status';
import type { MatterStatus } from '@/lib/types';

/** Badge de estado de expediente: color semántico + etiqueta i18n (`matters.status.*`). */
export function StatusBadge({ status }: { status: MatterStatus }) {
  const t = useTranslations('matters.status');
  return <Badge variant={statusVariant(status)}>{t(status)}</Badge>;
}
