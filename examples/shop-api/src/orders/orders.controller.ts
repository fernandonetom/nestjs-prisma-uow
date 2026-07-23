import { Controller, Post, Get, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { OrdersService } from './orders.service';

type OrderDto = {
  customer: string;
  email: string;
  items: { product: string; quantity: number; price: number }[];
};

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * POST /orders
   *
   * Creates an order with items inside a UoW transaction.
   */
  @Post()
  async createOrder(@Body() dto: OrderDto): Promise<{ id: number }> {
    return this.ordersService.createOrder(dto);
  }

  /**
   * POST /orders/rollback-demo
   *
   * Same as POST /orders, but uses email="rollback@example.com" to
   * trigger an intentional rollback (all writes are discarded).
   */
  @Post('rollback-demo')
  async createOrderRollbackDemo(@Body() dto: OrderDto): Promise<{ id: number }> {
    try {
      const order = await this.ordersService.createOrderWithRollbackDemo(dto);
      return order;
    } catch (error) {
      throw new HttpException(
        { message: (error as Error).message, note: 'All writes were rolled back' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * POST /orders/batch
   *
   * Creates TWO separate orders (with items) inside ONE transaction.
   * Both orders commit atomically — if the second fails, neither persists.
   *
   * Body: { order1: OrderDto, order2: OrderDto }
   */
  @Post('batch')
  async createBatch(
    @Body() body: { order1: OrderDto; order2: OrderDto },
  ): Promise<{ ids: number[] }> {
    return this.ordersService.createBatch(body.order1, body.order2);
  }

  /**
   * POST /orders/batch-rollback
   *
   * Creates two orders in a single transaction. The first order
   * succeeds, but the second is forced to fail (use
   * `order2.email = "fail@example.com"`).
   *
   * Prisma rolls back **everything** — including the first order.
   * Nothing persists in the database.
   *
   * Body: { order1: OrderDto, order2: OrderDto }
   */
  @Post('batch-rollback')
  async createBatchWithRollback(
    @Body() body: { order1: OrderDto; order2: OrderDto },
  ): Promise<{ ids: number[] }> {
    try {
      return await this.ordersService.createBatchWithRollback(
        body.order1,
        body.order2,
      );
    } catch (error) {
      throw new HttpException(
        { message: (error as Error).message, note: 'All writes were rolled back' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * GET /orders/:id
   */
  @Get(':id')
  async getOrder(@Param('id') id: string): Promise<unknown> {
    const order = await this.ordersService.findOrderById(Number(id));
    if (!order) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }
    return order;
  }

  /**
   * GET /orders/by-customer/:name
   */
  @Get('by-customer/:name')
  async getOrdersByCustomer(@Param('name') name: string): Promise<unknown> {
    return this.ordersService.findOrdersByCustomer(name);
  }
}
