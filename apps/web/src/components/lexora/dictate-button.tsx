'use client';

import { Mic, MicOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDictation } from '@/lib/use-dictation';
import { Button } from '@/components/ui/button';

/** Botón de dictado por voz: añade el texto reconocido vía `onText`. Oculto si el navegador no lo soporta. */
export function DictateButton({ onText }: { onText: (text: string) => void }) {
  const t = useTranslations('dictation');
  const { supported, listening, start, stop } = useDictation(onText);
  if (!supported) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant={listening ? 'default' : 'outline'}
      onClick={() => (listening ? stop() : start())}
      title={t(listening ? 'stop' : 'start')}
    >
      {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
      {listening ? t('listening') : t('dictate')}
    </Button>
  );
}
