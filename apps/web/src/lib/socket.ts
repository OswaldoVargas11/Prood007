'use client';

import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';

/**
 * Socket.IO singleton para el tiempo real (chat por expediente + notificaciones). Se autentica en el
 * handshake con el access token (en memoria); el `auth` callback se reevalúa en cada (re)conexión, así
 * que siempre usa el token vigente tras un refresh. El servidor une al socket a `user:<id>` y
 * `tenant:<id>`, y a `matter:<id>` al emitir `matter:subscribe`.
 */
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    socket = io(url, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    });
  }
  return socket;
}
