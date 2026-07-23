# Shop API — Example

Runnable NestJS application demonstrating `@feneto/nestjs-prisma-uow` with
a real PostgreSQL database.

## Architecture

```
POST /orders              → OrdersController
                               ↓
                          OrdersService (orchestration)
                               ↓
                   ┌─── PrismaUnitOfWork.do() ───┐
                   │  Order + OrderItem inside    │
                   │  a single DB transaction      │
                   └──────────────────────────────┘
                               ↓
                       OrdersRepository (queries)
                               ↓
                          PrismaClient (tx or root)
```

The library (`@feneto/nestjs-prisma-uow`) provides the transaction boundary.
The **application** owns the Prisma schema, PrismaService, and repository classes.
No abstract base repository ships in the library (AC-10).

## Models

- **Order** — `id`, `customer`, `email`, `createdAt`
- **OrderItem** — `id`, `product`, `quantity`, `price`, `orderId` → Order

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

```bash
pnpm install          # from repo root
```

### 4. Push the schema

```bash
pnpm --filter shop-api prisma:push
```

Or generate a migration:

```bash
pnpm --filter shop-api prisma:migrate -- --name init
```

### 5. Build and run

```bash
pnpm --filter shop-api build
pnpm --filter shop-api start
```

API available at `http://localhost:3000`.

## Usage Examples

### Create an order (committed)

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

### Trigger a rollback (no writes persisted)

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

### Get an order

```bash
curl http://localhost:3000/orders/1
```

### Find orders by customer

```bash
curl http://localhost:3000/orders/by-customer/Alice
```

## Key Files

| File | Purpose |
|------|---------|
| `src/prisma/prisma.service.ts` | Consumer-owned Prisma client wrapper (not from lib) |
| `src/prisma/prisma.module.ts` | Binds PrismaService to `PRISMA_CLIENT` token |
| `src/orders/orders.repository.ts` | Repository using raw Prisma client |
| `src/orders/orders.service.ts` | Service using `PrismaUnitOfWork` for transactions |
| `src/orders/orders.controller.ts` | HTTP endpoints |
| `src/app.module.ts` | Wires PrismaModule + PrismaUnitOfWorkModule |
| `prisma/schema.prisma` | Order + OrderItem models |
| `docker-compose.yml` | Local PostgreSQL |
