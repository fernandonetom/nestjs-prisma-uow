# Shop API — Example

Runnable NestJS application demonstrating `@feneto/nestjs-prisma-uow` with
a real PostgreSQL database and the DDD repository pattern.

## Architecture

```
POST /orders              → OrdersController
                               ↓
                          OrdersService (orchestration)
                               ↓
                   ┌─── PrismaUnitOfWork.do() ───┐
                   │  Order + OrderItem inside     │
                   │  a single DB transaction      │
                   └──────────────────────────────┘
                               ↓
               OrdersRepository  +  OrderItemsRepository
               (DI-injected, use     (DI-injected, use
                uow.transaction)      uow.transaction)
                               ↓
                          PrismaClient (tx or root)
```

The library (`@feneto/nestjs-prisma-uow`) provides the transaction boundary.
The **application** owns the Prisma schema, PrismaService, and repository classes.
Repositories inject `PrismaUnitOfWork` via NestJS DI and use `uow.transaction`
for all queries — which auto-resolves to the transactional client inside `do()`
or the root client outside.

## Models

| Model | Aggregate Root | Fields |
|-------|---------------|--------|
| **Order** | ✅ | `id`, `customer`, `email`, `createdAt` |
| **OrderItem** | ✅ | `id`, `product`, `quantity`, `price`, `orderId` → Order |
| **Product** | ✅ | `id`, `name`, `price` |
| **User** | ✅ | `id`, `email` (unique), `name` |

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

### Batch create (two orders, one transaction)

```bash
curl -X POST http://localhost:3000/orders/batch \
  -H "Content-Type: application/json" \
  -d '{
    "order1": { "customer": "Alice", "email": "alice@example.com", "items": [{"product":"A","quantity":1,"price":100}] },
    "order2": { "customer": "Bob", "email": "bob@example.com", "items": [{"product":"B","quantity":1,"price":200}] }
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
| `src/orders/orders.repository.interface.ts` | `IOrderRepository` contract (DDD) |
| `src/orders/orders.repository.ts` | Repository injecting `PrismaUnitOfWork`, using `uow.transaction` |
| `src/orders/orders.service.ts` | Service injecting 2 repos + UoW; orchestrates cross-aggregate writes |
| `src/orders/orders.controller.ts` | HTTP endpoints |
| `src/order-items/order-items.repository.interface.ts` | `IOrderItemRepository` contract |
| `src/order-items/order-items.repository.ts` | Repository injecting `PrismaUnitOfWork` |
| `src/products/products.repository.interface.ts` | `IProductRepository` contract |
| `src/products/products.repository.ts` | Repository injecting `PrismaUnitOfWork` |
| `src/users/users.repository.interface.ts` | `IUserRepository` contract |
| `src/users/users.repository.ts` | Repository injecting `PrismaUnitOfWork` |
| `src/app.module.ts` | Wires PrismaModule + PrismaUnitOfWorkModule + 4 feature modules |
| `prisma/schema.prisma` | Order, OrderItem, Product, User models |
| `docker-compose.yml` | Local PostgreSQL |
