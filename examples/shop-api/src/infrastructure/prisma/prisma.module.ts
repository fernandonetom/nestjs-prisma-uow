import { Module } from '@nestjs/common';
import { PRISMA_CLIENT } from '@feneto/nestjs-prisma-uow';
import { PrismaService } from './prisma.service';

/**
 * Binds the application's `PrismaService` to the `PRISMA_CLIENT` token
 * so the Unit of Work module can inject it.
 */
@Module({
  providers: [{ provide: PRISMA_CLIENT, useClass: PrismaService }],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
