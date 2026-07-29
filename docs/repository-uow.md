# Repository + Unit of Work Pattern

This guide shows how to combine the DDD repository pattern with the Unit of Work for transactional, cross-aggregate consistency.

## Core Concepts

- **Repository** — owns data access for one aggregate root. Injected via NestJS DI and uses `uow.transaction` for all queries (resolves to transactional client inside `do()`, root client outside).
- **Unit of Work** — groups multiple repository operations into a single database transaction. Provided by `PrismaUnitOfWork.do()`.
- **Aggregate root** — the top-level entity that repositories manage (Product, Order, OrderItem, User in the example). Each gets its own repository interface and implementation.
- **No base class** — `@feneto/nestjs-prisma-uow` does **not** ship an abstract base repository. Each repository is a plain class written by the consumer.

## Why This Library?

Without a UoW abstraction, coordinating writes across multiple repositories requires careful transaction management. With `@feneto/nestjs-prisma-uow`:

- **The service defines the transaction boundary** — one `uow.do()` wraps all aggregate writes.
- **Repositories stay "dumb"** — they just use `this.uow.transaction` and participate automatically in the active transaction.
- **Full DI compatibility** — repositories are standard NestJS `@Injectable()` providers. No `new Repository(tx)` anti-pattern inside callbacks.
- **ALS isolation** — concurrent requests each get their own isolated transaction, even with singleton providers.

## Pattern

### 1. Define a domain entity

Pure domain object — no ORM annotations, no infrastructure dependencies:

```ts
// domain/orders/order.entity.ts
export class Order {
  private _items: OrderItem[] = [];

  constructor(
    public readonly id: number,
    public readonly customer: string,
    public readonly email: string,
    public readonly createdAt: Date,
  ) {}

  get items(): ReadonlyArray<OrderItem> { return this._items; }
  addItem(item: OrderItem): void { this._items.push(item); }
}
```

### 2. Define a repository interface (domain layer contract)

```ts
// domain/orders/i-order.repository.ts
export interface IOrderRepository {
  save(customer: string, email: string): Promise<Order>;
  findById(id: number): Promise<Order | null>;
  findByCustomer(customer: string): Promise<Order[]>;
}
```

### 3. Implement in the infrastructure layer

The repository injects `PrismaUnitOfWork<PrismaClient>` and calls `this.uow.transaction` for all Prisma operations. It maps Prisma models to domain entities at the boundary:

```ts
// infrastructure/repositories/orders.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import { Order } from '../../domain/orders/order.entity';

@Injectable()
export class OrdersRepository implements IOrderRepository {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async save(customer: string, email: string): Promise<Order> {
    const client = this.uow.transaction;
    const result = await client.order.create({
      data: { customer, email },
    });
    return new Order(result.id, result.customer, result.email, result.createdAt);
  }

  async findById(id: number): Promise<Order | null> {
    const client = this.uow.transaction;
    const result = await client.order.findUnique({ where: { id } });
    if (!result) return null;
    return new Order(result.id, result.customer, result.email, result.createdAt);
  }
}
```

### 4. Orchestrate cross-aggregate writes in the service

The service (application layer) injects multiple repositories AND the Unit of Work. It calls `uow.do()` to start a transaction, and all repo operations inside it share the same transactional client.

```ts
// application/services/orders.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import { OrdersRepository } from '../../infrastructure/repositories/orders.repository';
import { OrderItemsRepository } from '../../infrastructure/repositories/order-items.repository';
import { ProductsRepository } from '../../infrastructure/repositories/products.repository';

@Injectable()
export class OrdersService {
  constructor(
    private readonly orderRepo: OrdersRepository,
    private readonly itemRepo: OrderItemsRepository,
    private readonly productRepo: ProductsRepository,
    private readonly uow: PrismaUnitOfWork<PrismaClient>,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // 1. Validate products exist (cross-aggregate read — outside transaction)
    const productNames = [...new Set(dto.items.map(i => i.product))];
    const existing = await this.productRepo.findByNames(productNames);
    const existingNames = new Set(existing.map(p => p.name));
    const missing = productNames.filter(n => !existingNames.has(n));
    if (missing.length > 0) {
      throw new BadRequestException(`Products not found: ${missing.join(', ')}`);
    }

    // 2. Create order + items atomically inside one transaction
    return this.uow.do(async () => {
      const order = await this.orderRepo.save(dto.customer, dto.email);
      await this.itemRepo.createItems(order.id, dto.items);
      return order;
    });
  }

  // Read-only operations use repos outside do() — no transaction overhead:
  async findOrderById(id: number): Promise<Order | null> {
    return this.orderRepo.findById(id);
  }
}
```

### 5. Wire up modules

The presentation module imports all repository providers and the service:

```ts
// presentation/orders.module.ts
@Module({
  providers: [
    OrdersService,
    OrdersRepository,
    OrderItemsRepository,
    ProductsRepository,
  ],
  controllers: [OrdersController],
})
export class OrdersModule {}

// app.module.ts
@Module({
  imports: [
    PrismaModule,
    PrismaUnitOfWorkModule.forRoot({
      imports: [PrismaModule],
      transactionOptions: { timeout: 5000 },
    }),
    OrdersModule,
  ],
})
export class AppModule {}
```

## Transaction flow (cross-aggregate)

```
OrdersService.createOrder(dto)
  └── uow.do(callback)
        └── Prisma.$transaction starts
              └── ALS stores transactional client (tx)
                    ├── orderRepo.save(customer, email)
                    │     └── this.uow.transaction → tx
                    │           └── tx.order.create(...)
                    │           └── return new Order(...)  ← maps to domain entity
                    ├── itemRepo.createItems(orderId, items)
                    │     └── this.uow.transaction → tx  (same tx!)
                    │           └── tx.orderItem.createMany(...)
                    └── return order
        ← Prisma.$transaction commits or rolls back
```

If any step throws, Prisma rolls back the entire transaction — including writes from all involved repositories.

## Extending to More Aggregates

The pattern scales naturally. To add a `Product` validation before creating an order:

```ts
// products.repository.ts
@Injectable()
export class ProductsRepository implements IProductRepository {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async findByIds(ids: number[]): Promise<Product[]> {
    return this.uow.transaction.product.findMany({
      where: { id: { in: ids } },
    });
  }
}
```

Then inject it into the service alongside other repos:

```ts
constructor(
  private readonly orderRepo: OrdersRepository,
  private readonly itemRepo: OrderItemsRepository,
  private readonly productRepo: ProductsRepository,  // new aggregate
  private readonly uow: PrismaUnitOfWork<PrismaClient>,
) {}

async createOrder(dto: CreateOrderDto) {
  // Validate products exist (read — outside transaction)
  const products = await this.productRepo.findByIds(dto.productIds);
  if (products.length !== dto.productIds.length) {
    throw new BadRequestException('Some products not found');
  }

  // Atomically create order + items
  return this.uow.do(async () => {
    const order = await this.orderRepo.save(dto.customer, dto.email);
    await this.itemRepo.createItems(order.id, dto.items);
    return order;
  });
}
```

Each aggregate root (Product, Order, OrderItem, User) follows the same pattern: interface → DI-injected implementation → service orchestration with UoW.

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
  async () => {
    await orderRepo.createOrder(dto);
  },
  { timeout: 2000 },
);
```

## Nested `do()` calls

Calling `do()` inside another `do()` callback reuses the existing transaction. No new `$transaction` is opened:

```ts
await uow.do(async () => {
  await orderRepo.createOrder(dto1);   // shares tx

  await uow.do(async () => {
    await orderRepo.createOrder(dto2); // same tx — no new transaction
  });

  // Both orders committed or rolled back together
});
```

## `transaction` getter

- **Inside `do()`:** returns the active transactional client.
- **Outside `do()`:** returns the root Prisma client (no transaction active).

```ts
// Inside a transaction → transactional client
await uow.do(async () => {
  const client = this.uow.transaction; // the transactional Prisma client
});

// Outside → root client
const client = this.uow.transaction; // the root PrismaClient instance
```

## ALS isolation

`AsyncLocalStorage` isolates the active transaction per async call chain. This means:

- Two concurrent HTTP requests each get their own transaction, even though `PrismaUnitOfWork` is a **singleton** provider.
- You do not need `REQUEST`-scoped DI.
- Workers, message handlers, and other non-HTTP async flows are also isolated.

```ts
// These two calls run concurrently without interfering:
await Promise.all([
  uow.do(async () => { /* isolated tx 1 */ }),
  uow.do(async () => { /* isolated tx 2 */ }),
]);
```
