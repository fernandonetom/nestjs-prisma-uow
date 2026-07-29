import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import type { IOrderRepository } from '../../domain/orders/i-order.repository';
import { Order } from '../../domain/orders/order.entity';
import { OrderItem } from '../../domain/order-items/order-item.entity';

/**
 * Infrastructure implementation of IOrderRepository.
 *
 * Maps Prisma models to domain entities at the repository boundary.
 */
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
    const result = await client.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!result) return null;

    const order = new Order(
      result.id,
      result.customer,
      result.email,
      result.createdAt,
    );

    for (const item of result.items) {
      order.addItem(
        new OrderItem(item.id, item.orderId, item.product, item.quantity, item.price),
      );
    }

    return order;
  }

  async findByCustomer(customer: string): Promise<Order[]> {
    const client = this.uow.transaction;
    const results = await client.order.findMany({
      where: { customer },
      include: { items: true },
    });

    return results.map((r) => {
      const order = new Order(r.id, r.customer, r.email, r.createdAt);
      for (const item of r.items) {
        order.addItem(
          new OrderItem(item.id, item.orderId, item.product, item.quantity, item.price),
        );
      }
      return order;
    });
  }
}
