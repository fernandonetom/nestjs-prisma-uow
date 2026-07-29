# Example Walkthrough — Shop API

This guide walks through the `examples/shop-api` application, a runnable NestJS app that demonstrates `@feneto/nestjs-prisma-uow` with a real PostgreSQL database using the DDD repository pattern.

## What it does

The example is an order management API demonstrating cross-aggregate transactional writes:

- **4 aggregate roots:** Order, OrderItem, Product, User — each with its own repository interface + DI-injected implementation
- Multi-aggregate writes inside a single transaction
- A rollback demo endpoint that aborts the transaction mid-flight
- Read endpoints using the root (non-transactional) client
- Full DDD layering: controller → service → repository → Prisma

## Prerequisites

- **Docker** (for PostgreSQL)
- **pnpm** (the monorepo packages manager)
- **Node.js** >= 20

## Quick Start

### 1. Start PostgreSQL

```bash
cd examples/shop-api
docker compose up -d
```

### 2. Set up environment

```bash
cp .env.example .env
```

### 3. Install dependencies

From the repository root:

```bash
pnpm install
```

This installs the library (`@feneto/nestjs-prisma-uow`) from the local workspace and all example dependencies.

### 4. Push the database schema

```bash
pnpm --filter shop-api prisma:push
```

Or generate and apply a migration:

```bash
pnpm --filter shop-api prisma:migrate -- --name init
```

### 5. Build and run

```bash
pnpm --filter shop-api build
pnpm --filter shop-api start
```

The API starts at `http://localhost:3000`.

## API Endpoints

### `POST /orders` — Create an order (committed)

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "Alice",
    "email": "alice@example.com",
    "items": [
      { "product": "Widget", "quantity": 2, "price": 1000 },
      { "product": "Gadget", "quantity": 1, "price": 5000 }
    ]
  }'
```

**Response:** `{ "id": 1 }`

The order and both items are persisted atomically across two aggregate repositories (`OrdersRepository` + `OrderItemsRepository`). If any item insert fails, the entire transaction rolls back.

### `POST /orders/rollback-demo` — Trigger a rollback

```bash
curl -X POST http://localhost:3000/orders/rollback-demo \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "Bob",
    "email": "rollback@example.com",
    "items": [
      { "product": "Doomed", "quantity": 1, "price": 100 }
    ]
  }'
```

**Response:** `400 — "Rollback demo — order aborted. All writes were rolled back."`

The service creates the order and items via the injected repositories, then checks the email. When it matches `rollback@example.com`, it throws an error. Prisma rolls back the entire transaction — no order or items remain in the database.

### `POST /orders/batch` — Two orders in one transaction

```bash
curl -X POST http://localhost:3000/orders/batch \
  -H "Content-Type: application/json" \
  -d '{
    "order1": { "customer": "Alice", "email": "alice@example.com", "items": [{"product":"A","quantity":1,"price":100}] },
    "order2": { "customer": "Bob", "email": "bob@example.com", "items": [{"product":"B","quantity":1,"price":200}] }
  }'
```

Both orders + items commit atomically or roll back together.

### `GET /orders/:id` — Get an order

```bash
curl http://localhost:3000/orders/1
```

Returns the order with all its items.

### `GET /orders/by-customer/:name` — Find orders by customer

```bash
curl http://localhost:3000/orders/by-customer/Alice
```

Returns all orders for the named customer.

## Architecture Walkthrough

### Project structure

```
examples/shop-api/
├── docker-compose.yml
├── .env.example
├── prisma/
│   └── schema.prisma           # Order, OrderItem, Product, User models
└── src/
    ├── main.ts
    ├── app.module.ts           # Root module
    ├── domain/                 # — Domain layer —
    │   ├── orders/
    │   │   ├── order.entity.ts               # Order aggregate root
    │   │   └── i-order.repository.ts         # IOrderRepository contract
    │   ├── order-items/
    │   │   ├── order-item.entity.ts          # OrderItem entity
    │   │   └── i-order-item.repository.ts    # IOrderItemRepository contract
    │   ├── products/
    │   │   ├── product.entity.ts             # Product entity
    │   │   └── i-product.repository.ts       # IProductRepository contract
    │   └── users/
    │       ├── user.entity.ts                # User entity
    │       └── i-user.repository.ts          # IUserRepository contract
    ├── application/            # — Application layer —
    │   ├── dtos/
    │   │   └── create-order.dto.ts
    │   └── services/
    │       ├── orders.service.ts             # Cross-aggregate orchestration
    │       ├── products.service.ts
    │       └── users.service.ts
    ├── infrastructure/         # — Infrastructure layer —
    │   ├── prisma/
    │   │   ├── prisma.service.ts             # Consumer-owned PrismaClient
    │   │   └── prisma.module.ts
    │   └── repositories/
    │       ├── orders.repository.ts          # IOrderRepository impl
    │       ├── order-items.repository.ts     # IOrderItemRepository impl
    │       ├── products.repository.ts        # IProductRepository impl
    │       └── users.repository.ts           # IUserRepository impl
    └── presentation/           # — Presentation layer —
        ├── orders.module.ts                  # Wires all layers
        └── controllers/
            └── orders.controller.ts          # HTTP endpoints
```

### Consumer-owned Prisma stack

The example owns its Prisma setup. The library only provides the Unit of Work — **not** a Prisma service:

```ts
// src/infrastructure/prisma/prisma.service.ts
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}

// src/infrastructure/prisma/prisma.module.ts
@Module({
  providers: [{ provide: PRISMA_CLIENT, useClass: PrismaService }],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
```

### Module wiring

`AppModule` imports `PrismaModule` and passes it to `PrismaUnitOfWorkModule.forRoot()`, plus the feature module:

```ts
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

### Repository pattern (DDD)

Each aggregate root has a repository interface defining its contract in the **domain layer**, and a concrete `@Injectable()` implementation in the **infrastructure layer** that injects `PrismaUnitOfWork`:

```ts
// Domain — contract (src/domain/orders/i-order.repository.ts)
export interface IOrderRepository {
  save(customer: string, email: string): Promise<Order>;
  findById(id: number): Promise<Order | null>;
}

// Infrastructure — implementation (src/infrastructure/repositories/orders.repository.ts)
@Injectable()
export class OrdersRepository implements IOrderRepository {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async save(customer: string, email: string): Promise<Order> {
    const client = this.uow.transaction;
    const result = await client.order.create({ data: { customer, email } });
    return new Order(result.id, result.customer, result.email, result.createdAt);
  }

  async findById(id: number): Promise<Order | null> {
    const client = this.uow.transaction;
    const result = await client.order.findUnique({ ... });
    if (!result) return null;
    return new Order(result.id, result.customer, result.email, result.createdAt);
  }
}
```

### Domain entities

Each aggregate root has a pure domain entity class — no ORM annotations, no infrastructure dependencies:

```ts
// src/domain/orders/order.entity.ts
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

### Service orchestration

The service (application layer) injects multiple repositories and the Unit of Work. It defines a single `uow.do()` boundary — all repos inside it share the same transaction:

```ts
@Injectable()
export class OrdersService {
  constructor(
    private readonly orderRepo: OrdersRepository,
    private readonly itemRepo: OrderItemsRepository,
    private readonly productRepo: ProductsRepository,
    private readonly uow: PrismaUnitOfWork<PrismaClient>,
  ) {}

  async createOrder(dto: CreateOrderDto) {
    // Validate products exist (cross-aggregate read — outside tx)
    const productNames = [...new Set(dto.items.map(i => i.product))];
    const existing = await this.productRepo.findByNames(productNames);
    if (existing.length !== productNames.length) {
      throw new BadRequestException('Some products not found');
    }

    // Create order + items atomically
    return this.uow.do(async () => {
      const order = await this.orderRepo.save(dto.customer, dto.email);
      await this.itemRepo.createItems(order.id, dto.items);
      return order;
    });
  }
}
```

### Rollback demo

The `POST /orders/rollback-demo` endpoint demonstrates what happens when a transaction is aborted mid-flight:

```ts
async createOrderWithRollbackDemo(dto: CreateOrderDto) {
  return this.uow.do(async () => {
    const order = await this.orderRepo.save(dto.customer, dto.email);
    await this.itemRepo.createItems(order.id, dto.items);

    if (dto.email === 'rollback@example.com') {
      throw new Error('Rollback demo — order aborted');
    }

    return order;
  });
}
```

Even though `save` and `createItems` completed successfully inside the transaction, the thrown error causes Prisma to roll back everything. No partial data is left in the database.

## Clean up

```bash
docker compose down -v
```

## Next Steps

- [Repository + UoW Pattern](./repository-uow.md) — deeper dive into the pattern
- [Testing Helpers](./testing.md) — how to test services that use `PrismaUnitOfWork`
