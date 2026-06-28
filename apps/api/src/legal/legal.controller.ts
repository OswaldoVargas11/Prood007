import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { LegalDocType, type Prisma } from '@prisma/client';
import { AllowExpired } from '../subscription/allow-expired.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { apiError } from '../common/api-messages';
import { LegalService } from './legal.service';
import { AcceptDto, SubscribeDto } from './dto/legal.dto';

/** Tipos cuyo texto vigente es público (sin autenticación). */
const PUBLIC_TYPES: LegalDocType[] = [
  LegalDocType.TERMS,
  LegalDocType.TERMS_CONSUMER,
  LegalDocType.PRIVACY,
  LegalDocType.SUBPROCESSORS,
];

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

  /** Documentos obligatorios que el gate exige aceptar (tipos nunca aceptados por el usuario). */
  @Get('must-accept')
  mustAccept(@CurrentUser() user: RequestUser) {
    return this.legal.mustAccept(user);
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

  /** Texto público vigente de un documento (para páginas públicas: subprocesadores, ToS, privacidad). */
  @Public()
  @Get('public/:type')
  publicDocument(@Param('type') type: string) {
    const upper = type.toUpperCase() as LegalDocType;
    if (!PUBLIC_TYPES.includes(upper))
      throw new BadRequestException(apiError('legal.invalidDocument'));
    return this.legal.publicCurrent(upper);
  }

  /** Suscribirse a los avisos de cambios de subprocesadores (art. 28.2 RGPD). */
  @Post('subprocessors/subscribe')
  subscribe(@CurrentUser() user: RequestUser, @Body() dto: SubscribeDto) {
    return this.legal.subscribeSubprocessors(user, dto.email);
  }

  /** Darse de baja de los avisos de subprocesadores. */
  @Delete('subprocessors/subscribe')
  unsubscribe(@CurrentUser() user: RequestUser, @Body() dto: SubscribeDto) {
    return this.legal.unsubscribeSubprocessors(user, dto.email);
  }
}
