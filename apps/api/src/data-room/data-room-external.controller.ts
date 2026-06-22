import { Body, Controller, Get, Ip, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { safeContentDisposition } from '../common/safe-download';
import { DataRoomService } from './data-room.service';
import { AskQuestionDto } from './dto/data-room.dto';

/**
 * Acceso EXTERNO al data room por enlace mágico (contraparte/externos, SIN cuenta). Público y
 * rate-limited; el token va en la ruta y el servidor valida con el cliente de sistema. Cada acción
 * queda registrada en el log de accesos del data room.
 */
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('data-rooms/external')
export class DataRoomExternalController {
  constructor(private readonly service: DataRoomService) {}

  @Get(':token')
  room(@Param('token') token: string, @Ip() ip: string) {
    return this.service.externalRoom(token, ip);
  }

  @Get(':token/documents/:docId/download')
  async download(
    @Param('token') token: string,
    @Param('docId') docId: string,
    @Ip() ip: string,
    @Res() res: Response,
  ) {
    const { name, mimeType, buffer } = await this.service.externalDownload(token, docId, ip);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', safeContentDisposition(mimeType, name));
    res.send(buffer);
  }

  @Get(':token/questions')
  questions(@Param('token') token: string) {
    return this.service.externalQuestions(token);
  }

  @Post(':token/questions')
  ask(@Param('token') token: string, @Body() dto: AskQuestionDto, @Ip() ip: string) {
    return this.service.externalAsk(token, dto, ip);
  }
}
