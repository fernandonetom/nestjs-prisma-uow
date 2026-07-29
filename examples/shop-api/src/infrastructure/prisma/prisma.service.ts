import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Application-owned Prisma client wrapper (Infrastructure layer).
 *
 * Provides a `PrismaClient` instance that is automatically connected on
 * module init and disconnected on module destroy.
 *
 * This is **not** part of `@feneto/nestjs-prisma-uow` — the library
 * expects the consumer to supply their own Prisma client.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
