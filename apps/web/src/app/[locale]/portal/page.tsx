'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Placeholder del portal del cliente (rol CLIENT). El shell del despacho redirige aquí a los usuarios
 * sin rol de staff. La superficie real (solo lectura + chat) llega en el slice F6.
 */
export default function PortalPage() {
  const t = useTranslations('portal');
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <Badge variant="info">{t('soon')}</Badge>
          <CardTitle className="mt-2">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </main>
  );
}
