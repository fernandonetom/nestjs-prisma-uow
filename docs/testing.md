# Testing Helpers

`@feneto/nestjs-prisma-uow` ships a testing entry (`/testing`) with a `MockUnitOfWork` class for consumer unit tests.

## Import

```ts
import { MockUnitOfWork } from '@feneto/nestjs-prisma-uow/testing';
```

## `MockUnitOfWork<TClient>`

A stub implementation of `IUnitOfWork<TClient>` that:

- Executes the callback **immediately** (no real database transaction).
- Records every `do()` call in an ordered `calls` array.
- Exposes the configured client via the `transaction` getter.

### Basic usage

```ts
import { MockUnitOfWork } from '@feneto/nestjs-prisma-uow/testing';

it('should call do() once', async () => {
  const uow = new MockUnitOfWork();

  const result = await uow.do(async () => 42);

  expect(result).toBe(42);
  expect(uow.calls).toHaveLength(1);
});
```

### With a mock Prisma client

```ts
import { MockUnitOfWork } from '@feneto/nestjs-prisma-uow/testing';
import type { PrismaClient } from '@prisma/client';

const mockPrisma = {
  order: { create: vi.fn().mockResolvedValue({ id: 1 }) },
} as unknown as PrismaClient;

const uow = new MockUnitOfWork(mockPrisma);

await uow.do(async (tx) => {
  const order = await tx.order.create({ data: {} });
  expect(order).toEqual({ id: 1 });
});

// Verify the transaction getter
expect(uow.transaction).toBe(mockPrisma);
```

### Inspecting calls

```ts
const uow = new MockUnitOfWork();

await uow.do(async () => 1);
await uow.do(async () => 2, { timeout: 5000 });

// Call count
expect(uow.calls).toHaveLength(2);

// Options from the second call
expect(uow.calls[1].options).toEqual({ timeout: 5000 });
```

### `transaction` getter

```ts
const client = { order: { findMany: vi.fn() } };
const uow = new MockUnitOfWork(client);

// Returns the configured client
expect(uow.transaction).toBe(client);
```

### Default client

When no client is provided to the constructor, `transaction` returns an empty object:

```ts
const uow = new MockUnitOfWork();
expect(uow.transaction).toEqual({});
```

## Using in NestJS service tests

When testing a service that injects `PrismaUnitOfWork`, provide `MockUnitOfWork` as a replacement:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import { MockUnitOfWork } from '@feneto/nestjs-prisma-uow/testing';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let uow: MockUnitOfWork;

  beforeEach(async () => {
    uow = new MockUnitOfWork();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaUnitOfWork, useValue: uow },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  it('should create an order inside do()', async () => {
    // The service calls uow.do() internally
    await service.createOrder({ ... });
    expect(uow.calls).toHaveLength(1);
  });
});
```

## Testing DI-injected repositories

With the DDD repository pattern (repositories inject `PrismaUnitOfWork` via DI), you provide both the mock UoW and concrete repository instances to the testing module:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import { MockUnitOfWork } from '@feneto/nestjs-prisma-uow/testing';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { OrderItemsRepository } from '../order-items/order-items.repository';

describe('OrdersService (DDD pattern)', () => {
  let service: OrdersService;
  let uow: MockUnitOfWork;

  beforeEach(async () => {
    uow = new MockUnitOfWork();

    // Repositories inject UoW → pass the same mock instance
    const orderRepo = new OrdersRepository(uow as any);
    const itemRepo = new OrderItemsRepository(uow as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        // Provide repositories as concrete values
        { provide: OrdersRepository, useValue: orderRepo },
        { provide: OrderItemsRepository, useValue: itemRepo },
        // Provide the UoW mock
        { provide: PrismaUnitOfWork, useValue: uow },
        OrdersService,
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  it('should create order + items inside a single transaction', async () => {
    await service.createOrder({
      customer: 'Alice',
      email: 'alice@example.com',
      items: [{ product: 'Widget', quantity: 1, price: 100 }],
    });

    // Assert exactly one transaction was started
    expect(uow.calls).toHaveLength(1);
  });
});
```

## API reference

### Constructor

```ts
new MockUnitOfWork<TClient>(client?: TClient)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `client` | `TClient` | `{}` | The mock/stub client exposed by `transaction` and passed to `do()` callbacks |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `transaction` | `TClient` | Returns the configured client |
| `calls` | `ReadonlyArray<{ fn, options }>` | Ordered list of every `do()` invocation, with per-call options |
