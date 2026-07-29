import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import type { IOrderItemRepository } from '../../domain/order-items/i-order-item.repository';

/**
 * Infrastructure implementation of IOrderItemRepository.
 */
@Injectable()
export class OrderItemsRepository implements IOrderItemRepository {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async createItems(
    orderId: number,
    items: { product: string; quantity: number; price: number }[],
  ): Promise<{ count: number }> {
    const client = this.uow.transaction;
    const result = await client.orderItem.createMany({
      data: items.map((i) => ({
        orderId,
        product: i.product,
        quantity: i.quantity,
        price: i.price,
      })),
    });
    return { count: result.count };
  }
}
