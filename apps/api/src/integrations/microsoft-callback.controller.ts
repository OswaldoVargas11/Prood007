import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MicrosoftService } from './microsoft.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Callback OAuth de Microsoft (público: el redirect del navegador no trae nuestra sesión). La URL debe
 * estar registrada como "Redirect URI" en la app de Azure (Microsoft Entra ID).
 */
@Public()
@Controller('integrations/microsoft')
export class MicrosoftCallbackController {
  constructor(private readonly microsoft: MicrosoftService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const appUrl = process.env.APP_PUBLIC_URL ?? 'https://lawzora.com';
    if (!code || !state) return res.redirect(`${appUrl}/es/settings?microsoft=error`);
    const { webRedirect } = await this.microsoft.handleCallback(code, state);
    return res.redirect(webRedirect);
  }
}
