import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { AllowExpired } from '../subscription/allow-expired.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { LegalService } from './legal.service';
import { AcceptDto } from './dto/legal.dto';

/**
 * Aceptación legal del usuario (clickwrap reforzado). Disponible aunque la prueba haya caducado
 * (`@AllowExpired`): re-aceptar términos no debe quedar tras el muro de suscripción. La escritura va por el
 * rol de app dentro del contexto de tenant de la request (RLS), y queda append-only por privilegios de columna.
 */
@AllowExpired()
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  /** Documentos vigentes que esta cuenta debe aceptar (según su perfil y jurisdicción). */
  @Get('documents')
  documents(@CurrentUser() user: RequestUser) {
    return this.legal.currentDocuments(user);
  }

  /** Subconjunto que este usuario aún no ha aceptado en su versión vigente. */
  @Get('pending')
  pending(@CurrentUser() user: RequestUser) {
    return this.legal.pending(user);
  }

  /** Registra la aceptación de uno o varios documentos con IP/user-agent de la request. */
  @Post('accept')
  accept(@CurrentUser() user: RequestUser, @Body() dto: AcceptDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const userAgent = req.get('user-agent') ?? 'unknown';
    return this.legal.accept(user, dto.items, {
      ip,
      userAgent,
      shownSnapshot: dto.shownSnapshot as Prisma.InputJsonValue | undefined,
    });
  }
}
