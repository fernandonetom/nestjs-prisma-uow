# Repository + Unit of Work Pattern

This guide shows how to combine the repository pattern with the Unit of Work for transactional, DDD-style code.

## Core Concepts

- **Repository** — owns data access for one aggregate root. Receives a Prisma client (transactional or root) so queries participate in the active UoW transaction.
- **Unit of Work** — groups multiple repository operations into a single database transaction. Provided by `PrismaUnitOfWork.do()`.
- **No base class** — `@feneto/nestjs-prisma-uow` does **not** ship an abstract base repository. Each repository is a plain class written by the consumer.

## Pattern

The repository takes a `PrismaClient` in its constructor. When called from inside `uow.do()`, the transactional client is passed so all writes and reads see a consistent snapshot.

```ts
import type { PrismaClient } from '@prisma/client';

export class OrdersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createOrder(params: {
    customer: string;
    email: string;
    items: { product: string; quantity: number; price: number }[];
  }): Promise<{ id: number }> {
    return this.prisma.order.create({
      data: {
        customer: params.customer,
        email: params.email,
        items: {
          create: params.items,
        },
      },
      select: { id: true },
    });
  }

  async findOrderById(id: number) {
    return this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
  }
}
```

The service orchestrates repository calls inside a Unit of Work:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async createOrder(dto: CreateOrderDto): Promise<{ id: number }> {
    return this.uow.do(async (tx) => {
      const repo = new OrdersRepository(tx);
      const order = await repo.createOrder(dto);

      // You can create additional repositories that share the same tx:
      // const auditRepo = new AuditRepository(tx);
      // await auditRepo.log('OrderCreated', order.id);

      return order;
    });
  }

  // Read-only operations can use the root client (no transaction overhead):
  async findOrderById(id: number) {
    const repo = new OrdersRepository(this.uow.transaction);
    return repo.findOrderById(id);
  }
}
```

## Transaction flow

```
Service.createOrder()
  └── uow.do(fn)
        └── Prisma.$transaction starts
              └── fn(tx)                  ← ALS stores tx
                    ├── new OrdersRepository(tx).createOrder(dto)
                    │     └── tx.order.create(...)
                    ├── new AuditRepository(tx).log(...)
                    │     └── tx.audit.create(...)
                    └── return result
        ← Prisma.$transaction commits
```

If any step throws, Prisma rolls back the entire transaction.

## Transaction Options

The `TransactionOptions` type supports these fields, matching Prisma's interactive transaction API:

| Option | Type | Description |
|--------|------|-------------|
| `timeout` | `number` | Maximum time (ms) to wait for the transaction to complete |
| `maxWait` | `number` | Maximum time (ms) to wait to acquire a lock |
| `isolationLevel` | `IsolationLevel` | Transaction isolation level |

### Setting defaults

Set global defaults on the module:

```ts
PrismaUnitOfWorkModule.forRoot({
  transactionOptions: {
    timeout: 10000,
    isolationLevel: 'Serializable',
  },
});
```

### Per-call overrides

Override options for a specific `do()` call. Per-call options only apply when a **new** transaction is started — they are ignored for nested calls.

```ts
await uow.do(
  async (tx) => {
    // This transaction gets a 2-second timeout
    await tx.user.create({ data: { name: 'Alice' } });
  },
  { timeout: 2000 },
);
```

## Nested `do()` calls

Calling `do()` inside another `do()` callback reuses the existing transaction. No new `$transaction` is opened:

```ts
await uow.do(async (tx) => {
  // Outer: starts a new transaction
  await uow.do(async (innerTx) => {
    // Inner: reuses the same tx — innerTx === tx
    await tx.order.create({ data: { ... } });
  });
  // Both operations committed (or rolled back) together
});
```

## `transaction` getter

- **Inside `do()`:** returns the active transactional client (the `tx` argument).
- **Outside `do()`:** returns the root Prisma client (no transaction active).

This is useful for read-only queries or operations that do not need a transaction:

```ts
// Inside a transaction → transactional client
await uow.do(async (tx) => {
  const client = this.uow.transaction; // same as tx
});

// Outside → root client
const client = this.uow.transaction; // the PrismaClient instance
```

## ALS isolation

`AsyncLocalStorage` isolates the active transaction per async call chain. This means:

- Two concurrent HTTP requests each get their own transaction, even though `PrismaUnitOfWork` is a **singleton** provider.
- You do not need `REQUEST`-scoped DI.
- Workers, message handlers, and other non-HTTP async flows are also isolated.

```ts
// These two calls run concurrently without interfering:
await Promise.all([
  uow.do(async (tx1) => { /* tx1 isolated */ }),
  uow.do(async (tx2) => { /* tx2 isolated */ }),
]);
```
