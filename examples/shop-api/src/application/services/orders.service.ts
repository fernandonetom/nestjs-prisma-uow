import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';

// Domain entities
import type { Order } from '../../domain/orders/order.entity';

// Application DTOs
import type { CreateOrderDto } from '../dtos/create-order.dto';

// Infrastructure — concrete implementations (for NestJS DI)
import { OrdersRepository } from '../../infrastructure/repositories/orders.repository';
import { OrderItemsRepository } from '../../infrastructure/repositories/order-items.repository';
import { ProductsRepository } from '../../infrastructure/repositories/products.repository';

/**
 * Application service for Order orchestration.
 *
 * Defines the transactional boundary across multiple aggregate roots
 * (Order, OrderItem, Product). Injects repository interfaces (typed via
 * concrete classes for NestJS DI) and the Unit of Work.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly orderRepo: OrdersRepository,
    private readonly itemRepo: OrderItemsRepository,
    private readonly productRepo: ProductsRepository,
    private readonly uow: PrismaUnitOfWork<PrismaClient>,
  ) {}

  /**
   * Create an order with items inside a single transaction.
   *
   * 1. Validates product existence (read outside tx).
   * 2. Saves order + items atomically inside `uow.do()`.
   */
  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // Cross-aggregate read: validate products exist
    const productNames = [...new Set(dto.items.map((i) => i.product))];

    if (productNames.length > 0) {
      const existingProducts = await this.productRepo.findByNames(productNames);
      const existingNames = new Set(existingProducts.map((p) => p.name));
      const missing = productNames.filter((n) => !existingNames.has(n));

      if (missing.length > 0) {
        throw new BadRequestException(
          `Products not found: ${missing.join(', ')}`,
        );
      }
    }

    // Cross-aggregate write: order + items in one transaction
    return this.uow.do(async () => {
      const order = await this.orderRepo.save(dto.customer, dto.email);

      await this.itemRepo.createItems(order.id, dto.items);

      return order;
    });
  }

  /**
   * Rollback demo — creates order, then intentionally aborts.
   */
  async createOrderWithRollbackDemo(dto: CreateOrderDto): Promise<Order> {
    return this.uow.do(async () => {
      const order = await this.orderRepo.save(dto.customer, dto.email);

      await this.itemRepo.createItems(order.id, dto.items);

      if (dto.email === 'rollback@example.com') {
        throw new Error('Rollback demo — order aborted');
      }

      return order;
    });
  }

  /**
   * Batch: two orders + items in ONE transaction.
   */
  async createBatch(
    dto1: CreateOrderDto,
    dto2: CreateOrderDto,
  ): Promise<{ ids: number[] }> {
    return this.uow.do(async () => {
      const order1 = await this.orderRepo.save(dto1.customer, dto1.email);
      await this.itemRepo.createItems(order1.id, dto1.items);

      const order2 = await this.orderRepo.save(dto2.customer, dto2.email);
      await this.itemRepo.createItems(order2.id, dto2.items);

      return { ids: [order1.id, order2.id] };
    });
  }

  /**
   * Batch with forced rollback on second order.
   */
  async createBatchWithRollback(
    dto1: CreateOrderDto,
    dto2: CreateOrderDto,
  ): Promise<{ ids: number[] }> {
    return this.uow.do(async () => {
      const order1 = await this.orderRepo.save(dto1.customer, dto1.email);
      await this.itemRepo.createItems(order1.id, dto1.items);

      if (dto2.email === 'fail@example.com') {
        throw new Error(
          `Batch rollback demo — second order aborted. ` +
          `Order #${order1.id} was created but will be rolled back.`,
        );
      }

      const order2 = await this.orderRepo.save(dto2.customer, dto2.email);
      await this.itemRepo.createItems(order2.id, dto2.items);

      return { ids: [order1.id, order2.id] };
    });
  }

  /** Read-only: find order by ID (uses root client outside tx). */
  async findOrderById(id: number): Promise<Order | null> {
    return this.orderRepo.findById(id);
  }

  /** Read-only: find orders by customer. */
  async findOrdersByCustomer(customer: string): Promise<Order[]> {
    return this.orderRepo.findByCustomer(customer);
  }
}
