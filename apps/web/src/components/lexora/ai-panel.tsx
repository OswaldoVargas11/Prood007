'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

/**
 * Panel del asistente IA (patrón recurrente del diseño: Sheet a la derecha). El backend define el
 * contrato `AiAssistantProvider` con citación obligatoria y señal de confianza, pero NO está cableado
 * en el MVP (D-011). Aquí queda el patrón de UI con sus señales; el cableado llega cuando se active.
 */
export function AiPanel() {
  const t = useTranslations('ai');
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="text-[var(--brand)]" />
          <span className="hidden sm:inline">{t('assistant')}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--brand)]" />
            {t('assistant')}
          </SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Badge variant="info">{t('soon')}</Badge>
          <p className="max-w-xs text-sm text-muted-foreground">{t('placeholder')}</p>
          <p className="max-w-xs text-xs text-muted-foreground/70">{t('citations')}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
