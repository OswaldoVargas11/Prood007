import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import { CreateDocumentPackageDto } from './dto/create-document-package.dto';

const SELECT = { id: true, name: true, templateIds: true };

/** Paquetes de plantillas compartidos por el despacho (ensamblado multi-documento). Acotado por RLS. */
@Injectable()
export class DocumentPackagesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.documentPackage.findMany({ orderBy: { name: 'asc' }, select: SELECT });
  }

  create(user: RequestUser, dto: CreateDocumentPackageDto) {
    return this.prisma.documentPackage.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        templateIds: [...new Set(dto.templateIds)],
      },
      select: SELECT,
    });
  }

  async remove(user: RequestUser, id: string) {
    const res = await this.prisma.documentPackage.deleteMany({
      where: { id, tenantId: user.tenantId },
    });
    if (res.count === 0) throw new NotFoundException({ messageKey: 'documentPackages.notFound' });
    return { success: true };
  }
}
