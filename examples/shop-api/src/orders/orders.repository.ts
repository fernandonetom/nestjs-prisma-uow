import type { PrismaClient } from '@prisma/client';

/**
 * Repository for Order + OrderItem queries.
 *
 * Receives a Prisma client (either the transactional client from UoW or
 * the root client) so queries participate in the active transaction when
 * called from inside `uow.do()`.
 *
 * This is an **example** demonstrating the repository pattern.
 * `@feneto/nestjs-prisma-uow` does **not** ship a base repository class (AC-10).
 */
export class OrdersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createOrder(params: {
    customer: string;
    email: string;
    items: { product: string; quantity: number; price: number }[];
  }): Promise<{ id: number }> {
    return this.prisma.order.create({
      data: {
        customer: params.customer,
        email: params.email,
        items: {
          create: params.items.map((i) => ({
            product: i.product,
            quantity: i.quantity,
            price: i.price,
          })),
        },
      },
      select: { id: true },
    });
  }

  async findOrderById(id: number): Promise<{
    id: number;
    customer: string;
    email: string;
    items: { id: number; product: string; quantity: number; price: number }[];
  } | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
  }

  async findOrdersByCustomer(customer: string): Promise<{
    id: number;
    customer: string;
    email: string;
    items: { id: number; product: string; quantity: number; price: number }[];
  }[]> {
    return this.prisma.order.findMany({
      where: { customer },
      include: { items: true },
    });
  }
}
