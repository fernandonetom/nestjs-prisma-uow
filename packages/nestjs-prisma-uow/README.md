# @feneto/nestjs-prisma-uow

NestJS Prisma Unit of Work — transactional boundaries for DDD-style repositories.

[![npm](https://img.shields.io/npm/v/@feneto/nestjs-prisma-uow)](https://www.npmjs.com/package/@feneto/nestjs-prisma-uow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/fernandonetom/nestjs-prisma-uow/blob/main/LICENSE)

## Features

- **`IUnitOfWork<TClient>`** interface with `do(fn)` + `transaction` accessor
- **`PrismaUnitOfWork`** — Prisma interactive `$transaction` wrapper
- **DDD repository pattern** — DI-injected repos share one transaction across aggregates
- **Nested `do()` reuse** — no redundant transactions
- **ALS isolation** — `AsyncLocalStorage` per async chain, safe for singletons
- **NestJS module** — `forRoot` / `forRootAsync` with default tx options
- **`/testing` export** — `MockUnitOfWork` for consumer unit tests
- **≥ 90% test coverage** via Vitest

## Install

```bash
npm install @feneto/nestjs-prisma-uow @prisma/client
# or
pnpm add @feneto/nestjs-prisma-uow @prisma/client
```

Peer dependencies: NestJS 10–11, Prisma Client 5–6.

## Quick Start

### 1. Provide your Prisma client

```ts
import { Module } from '@nestjs/common';
import { PRISMA_CLIENT } from '@feneto/nestjs-prisma-uow';
import { PrismaService } from './prisma.service';

@Module({
  providers: [{ provide: PRISMA_CLIENT, useClass: PrismaService }],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
```

### 2. Register the UoW module

```ts
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

### 3. Use it in a service

```ts
import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async createOrder(dto: CreateOrderDto) {
    return this.uow.do(async (tx) => {
      // All writes inside this callback share one DB transaction.
      // If anything throws, the transaction rolls back.
      const order = await tx.order.create({ data: { ... } });
      await tx.orderItem.createMany({ data: dto.items });
      return order;
    });
  }
}
```

### 4. Go DDD — inject multiple repos into one UoW

```ts
@Injectable()
export class OrdersService {
  constructor(
    private readonly orderRepo: OrdersRepository,       // DI-injected
    private readonly itemRepo: OrderItemsRepository,     // DI-injected
    private readonly uow: PrismaUnitOfWork<PrismaClient>,
  ) {}

  async createOrder(dto: CreateOrderDto) {
    return this.uow.do(async () => {
      // Both repos share the same transaction automatically
      const order = await this.orderRepo.createOrder(dto);
      await this.itemRepo.createItems(order.id, dto.items);
      return order;
    });
  }
}
```

Repositories inject the UoW and use `this.uow.transaction` — which auto-resolves
to the active transactional client inside `do()` or the root client outside.

## Transaction Options

Set defaults on the module or override per call:

```ts
// Module defaults
PrismaUnitOfWorkModule.forRoot({
  transactionOptions: { timeout: 5000, isolationLevel: 'Serializable' },
});

// Per-call override (only when starting a new transaction)
await uow.do(async (tx) => { /* ... */ }, { timeout: 1000 });
```

## Testing

Import the mock for your own unit tests:

```ts
import { MockUnitOfWork } from '@feneto/nestjs-prisma-uow/testing';

const uow = new MockUnitOfWork();
await uow.do(async () => 42);
expect(uow.calls).toHaveLength(1);
```

## Example App

See [`examples/shop-api/`](https://github.com/fernandonetom/nestjs-prisma-uow/tree/main/examples/shop-api) for a full NestJS app with
Order + OrderItem + Product + User models, docker-compose PostgreSQL, DDD-style repository interfaces,
DI-injected repositories, and UoW rollback demo.

## Documentation

- [Install & Setup](https://github.com/fernandonetom/nestjs-prisma-uow/blob/main/docs/install.md)
- [Repository + UoW Pattern](https://github.com/fernandonetom/nestjs-prisma-uow/blob/main/docs/repository-uow.md)
- [Testing Helpers](https://github.com/fernandonetom/nestjs-prisma-uow/blob/main/docs/testing.md)
- [Example Walkthrough](https://github.com/fernandonetom/nestjs-prisma-uow/blob/main/docs/example-walkthrough.md)

## License

MIT © [Fernando Neto](https://github.com/fernandonetom)
