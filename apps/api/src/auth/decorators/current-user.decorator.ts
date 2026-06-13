import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../auth.types';

/** Inyecta el usuario autenticado (o una de sus propiedades) en el handler. */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext): RequestUser | unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
