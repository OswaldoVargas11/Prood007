import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

/** Búsqueda global (clientes/expedientes/documentos/facturas). PrismaModule es global. */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
