'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FileCheck2, MessageSquare, Receipt } from 'lucide-react';
import { createElement } from 'react';
import { getSocket } from '@/lib/socket';
import { useLocalizeNotificationText } from '@/lib/notifications';
import { useAuth } from '@/lib/auth';

interface IncomingNotification {
  type: string;
  title: string;
  body: string | null;
}

interface IncomingMessage {
  authorId?: string;
}

/**
 * Toasts en tiempo real, complementarios a la campana. Escucha los eventos de socket ya existentes:
 *  - `notification:new` (sala `user:<id>`): revisión de documentos, cobro/dunning, costes, tareas…
 *  - `message:new` (salas `matter:<id>` a las que el usuario esté suscrito): mensajes de chat.
 * Reusa la localización de enums de notificación. No persiste nada: el centro de notificaciones (y su
 * campana) siguen siendo la fuente durable; el toast es solo un aviso efímero.
 *
 * Se monta una vez por superficie (shell del despacho y del portal).
 */
export function RealtimeToasts() {
  const t = useTranslations('toasts');
  const localize = useLocalizeNotificationText();
  const { user } = useAuth();
  const userId = user?.userId;

  useEffect(() => {
    const socket = getSocket();

    const onNotification = (n: IncomingNotification) => {
      // La campana se refresca en su propio efecto; aquí solo mostramos el aviso efímero.
      const title = localize(n.title);
      const description = n.body ? localize(n.body) : undefined;
      if (n.type.startsWith('document')) {
        toast(title, { description, icon: createElement(FileCheck2, { className: 'size-4' }) });
      } else if (
        n.type.startsWith('dunning') ||
        n.type.startsWith('payment') ||
        n.type.startsWith('invoice') ||
        n.type.startsWith('cost')
      ) {
        toast(title, { description, icon: createElement(Receipt, { className: 'size-4' }) });
      } else {
        toast(title, { description });
      }
    };

    const onMessage = (msg: IncomingMessage) => {
      // No avisar de los mensajes propios (el evento llega también al emisor).
      if (msg?.authorId && msg.authorId === userId) return;
      toast(t('newMessage'), {
        icon: createElement(MessageSquare, { className: 'size-4' }),
      });
    };

    socket.on('notification:new', onNotification);
    socket.on('message:new', onMessage);
    return () => {
      socket.off('notification:new', onNotification);
      socket.off('message:new', onMessage);
    };
  }, [t, localize, userId]);

  return null;
}
