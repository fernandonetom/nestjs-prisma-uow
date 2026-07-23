import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import { OrdersRepository } from './orders.repository';

interface CreateOrderDto {
  customer: string;
  email: string;
  items: { product: string; quantity: number; price: number }[];
}

/**
 * Application service orchestrating order creation inside a Unit of Work.
 *
 * All Order + OrderItem writes run in a single transaction. If any step fails
 * (e.g. a business rule violation or DB error), the entire transaction rolls back.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  /**
   * Create an order with its items inside a transaction.
   *
   * The repository receives the transactional client so its queries
   * participate in the active transaction.
   */
  async createOrder(dto: CreateOrderDto): Promise<{ id: number }> {
    return this.uow.do(async (tx) => {
      const repo = new OrdersRepository(tx);
      return repo.createOrder(dto);
    });
  }

  /**
   * Demonstrates a multi-step transaction with a rollback path.
   *
   * The order and items are created, but if the customer email is
   * `"rollback@example.com"`, the transaction is intentionally aborted.
   */
  async createOrderWithRollbackDemo(dto: CreateOrderDto): Promise<{ id: number }> {
    return this.uow.do(async (tx) => {
      const repo = new OrdersRepository(tx);
      const order = await repo.createOrder(dto);

      // Simulate a business rule that triggers rollback
      if (dto.email === 'rollback@example.com') {
        throw new Error('Rollback demo — order aborted');
      }

      return order;
    });
  }

  /**
   * Batch create: two independent orders inside ONE transaction.
   *
   * Demonstrates multiple separate repository writes (each doing their own
   * `prisma.order.create`) that all commit atomically.
   */
  async createBatch(
    dto1: CreateOrderDto,
    dto2: CreateOrderDto,
  ): Promise<{ ids: number[] }> {
    return this.uow.do(async (tx) => {
      const repo = new OrdersRepository(tx);

      // Operation 1: create first order + items
      const order1 = await repo.createOrder(dto1);

      // Operation 2: create second order + items (separate DB operation)
      const order2 = await repo.createOrder(dto2);

      return { ids: [order1.id, order2.id] };
    });
  }

  /**
   * Batch create with forced failure: first order succeeds, second fails.
   *
   * This demonstrates that even though the first `prisma.order.create`
   * completed successfully inside the transaction, Prisma rolls
   * **everything** back when the second write throws.
   *
   * No rows remain in the database after this returns an error.
   */
  async createBatchWithRollback(
    dto1: CreateOrderDto,
    dto2: CreateOrderDto,
  ): Promise<{ ids: number[] }> {
    return this.uow.do(async (tx) => {
      const repo = new OrdersRepository(tx);

      // Step 1 — succeeds
      const order1 = await repo.createOrder(dto1);

      // Step 2 — simulate a DB-level failure that aborts the transaction
      // (Prisma throws here because the email matches our sentinel)
      if (dto2.email === 'fail@example.com') {
        throw new Error(
          `Batch rollback demo — second order aborted. ` +
          `Order #${order1.id} was created but will be rolled back.`,
        );
      }

      const order2 = await repo.createOrder(dto2);
      return { ids: [order1.id, order2.id] };
    });
  }

  /**
   * Find an order by ID (read-only — no transaction needed).
   */
  async findOrderById(id: number): Promise<ReturnType<OrdersRepository['findOrderById']>> {
    const repo = new OrdersRepository(this.uow.transaction);
    return repo.findOrderById(id);
  }

  /**
   * Find orders by customer (read-only).
   */
  async findOrdersByCustomer(customer: string): Promise<ReturnType<OrdersRepository['findOrdersByCustomer']>> {
    const repo = new OrdersRepository(this.uow.transaction);
    return repo.findOrdersByCustomer(customer);
  }
}
