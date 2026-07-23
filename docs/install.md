# Install & Setup

## Prerequisites

- **Node.js** >= 20 (LTS)
- **pnpm** (recommended) or npm
- An existing or new NestJS project with Prisma set up

## Install the package

```bash
npm install @feneto/nestjs-prisma-uow @prisma/client
# or
pnpm add @feneto/nestjs-prisma-uow @prisma/client
```

The library declares these as **peer dependencies** — your project must already provide them:

| Package | Supported versions |
|---------|-------------------|
| `@nestjs/common` | 10.x, 11.x |
| `@nestjs/core` | 10.x, 11.x |
| `@prisma/client` | 5.x, 6.x |
| `reflect-metadata` | 0.1.x, 0.2.x |
| `rxjs` | 7.x |

## Setup

### 1. Create a Prisma module (consumer-owned)

The library does **not** ship a `PrismaService`. You own your Prisma client. Create a module that binds your client to the injection token `PRISMA_CLIENT`:

```ts
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```ts
// src/prisma/prisma.module.ts
import { Module } from '@nestjs/common';
import { PRISMA_CLIENT } from '@feneto/nestjs-prisma-uow';
import { PrismaService } from './prisma.service';

@Module({
  providers: [{ provide: PRISMA_CLIENT, useClass: PrismaService }],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
```

### 2. Register the Unit of Work module

Use `forRoot` for static configuration or `forRootAsync` when you need to read options from a config service at startup.

#### Synchronous (`forRoot`)

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaUnitOfWorkModule } from '@feneto/nestjs-prisma-uow';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PrismaUnitOfWorkModule.forRoot({
      imports: [PrismaModule],
      transactionOptions: { timeout: 5000 },
    }),
  ],
})
export class AppModule {}
```

#### Asynchronous (`forRootAsync`)

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaUnitOfWorkModule } from '@feneto/nestjs-prisma-uow';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forRoot(),
    PrismaUnitOfWorkModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.get<number>('DB_TX_TIMEOUT', 5000),
        isolationLevel: 'Serializable',
      }),
    }),
  ],
})
export class AppModule {}
```

### 3. Inject `PrismaUnitOfWork` into your services

```ts
import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async createOrder(dto: CreateOrderDto) {
    return this.uow.do(async (tx) => {
      // All writes inside this callback share one database transaction.
      const order = await tx.order.create({ data: { ... } });
      await tx.orderItem.createMany({ data: dto.items });
      return order;
    });
  }
}
```

The module is registered as **global by default** (`isGlobal: true`), so you do not need to import it in every feature module. If you prefer explicit imports, set `isGlobal: false` in `forRoot` / `forRootAsync`.

## Module Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `imports` | `DynamicModule['imports']` | `[]` | Modules to bring into scope (include your `PrismaModule` here) |
| `isGlobal` | `boolean` | `true` | Register the module globally so `PrismaUnitOfWork` is available everywhere |
| `transactionOptions` | `TransactionOptions` | `{}` | Default options for every new transaction |

## Next Steps

- [Repository + UoW Pattern](./repository-uow.md) — how to combine repositories with the Unit of Work
- [Transaction Options](./repository-uow.md#transaction-options) — timeout, max wait, isolation levels
- [Testing Helpers](./testing.md) — mock UoW for consumer unit tests
