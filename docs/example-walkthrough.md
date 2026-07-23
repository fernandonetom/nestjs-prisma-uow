# Example Walkthrough — Shop API

This guide walks through the `examples/shop-api` application, a runnable NestJS app that demonstrates `@feneto/nestjs-prisma-uow` with a real PostgreSQL database.

## What it does

The example is a minimal order management API with:

- **Order** + **OrderItem** models (1-to-many)
- Multi-aggregate writes inside a single transaction
- A rollback demo endpoint that aborts the transaction mid-flight
- Read endpoints using the root (non-transactional) client

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

The `.env` file points to `postgresql://postgres:postgres@localhost:5432/shop`. You can customize it.

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

The order and both items are persisted atomically. If any item insert fails, the entire transaction rolls back.

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

The service creates the order, then checks the email. When it matches `rollback@example.com`, it throws an error. Prisma rolls back the entire transaction — no order or items remain in the database.

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
├── docker-compose.yml          # PostgreSQL service
├── .env.example                # Environment template
├── prisma/
│   └── schema.prisma           # Order + OrderItem models
└── src/
    ├── main.ts                 # NestJS bootstrap
    ├── app.module.ts           # Root module wiring
    ├── prisma/
    │   ├── prisma.service.ts   # Consumer-owned PrismaClient
    │   └── prisma.module.ts    # Binds to PRISMA_CLIENT token
    └── orders/
        ├── orders.controller.ts # HTTP endpoints
        ├── orders.service.ts   # Orchestration with UoW
        ├── orders.repository.ts # Data access (no base class)
        └── orders.module.ts    # Feature module
```

### Consumer-owned Prisma stack

The example owns its Prisma setup. The library only provides the Unit of Work — **not** a Prisma service:

```ts
// src/prisma/prisma.service.ts
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}

// src/prisma/prisma.module.ts
@Module({
  providers: [{ provide: PRISMA_CLIENT, useClass: PrismaService }],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
```

### Module wiring

`AppModule` imports `PrismaModule` (the consumer's client) and passes it to `PrismaUnitOfWorkModule.forRoot()`:

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

### Service + Repository

The service injects `PrismaUnitOfWork<PrismaClient>` and creates repositories inside `do()`:

```ts
@Injectable()
export class OrdersService {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async createOrder(dto: CreateOrderDto) {
    return this.uow.do(async (tx) => {
      const repo = new OrdersRepository(tx);
      return repo.createOrder(dto);
    });
  }
}
```

The repository is a plain class (no base class from the library):

```ts
export class OrdersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createOrder(params: { ... }) {
    return this.prisma.order.create({
      data: { ... },
      include: { items: true },
    });
  }
}
```

### Rollback demo

The `POST /orders/rollback-demo` endpoint demonstrates what happens when a transaction is aborted mid-flight:

```ts
async createOrderWithRollbackDemo(dto: CreateOrderDto) {
  return this.uow.do(async (tx) => {
    const repo = new OrdersRepository(tx);
    const order = await repo.createOrder(dto);

    if (dto.email === 'rollback@example.com') {
      throw new Error('Rollback demo — order aborted');
    }

    return order;
  });
}
```

Even though `createOrder` completed successfully, the thrown error causes Prisma to roll back the entire transaction. No partial data is left behind.

## Clean up

```bash
docker compose down -v
```

## Next Steps

- [Repository + UoW Pattern](./repository-uow.md) — deeper dive into the pattern
- [Testing Helpers](./testing.md) — how to test services that use `PrismaUnitOfWork`
