import { Controller, Post, Get, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { OrdersService } from '../../application/services/orders.service';
import type { CreateOrderDto } from '../../application/dtos/create-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * POST /orders — Create order with items in a transaction.
   */
  @Post()
  async createOrder(@Body() dto: CreateOrderDto): Promise<{ id: number }> {
    const order = await this.ordersService.createOrder(dto);
    return { id: order.id };
  }

  /**
   * POST /orders/rollback-demo — Rollback triggered by email.
   */
  @Post('rollback-demo')
  async createOrderRollbackDemo(@Body() dto: CreateOrderDto): Promise<{ id: number }> {
    try {
      const order = await this.ordersService.createOrderWithRollbackDemo(dto);
      return { id: order.id };
    } catch (error) {
      throw new HttpException(
        { message: (error as Error).message, note: 'All writes were rolled back' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * POST /orders/batch — Two orders in one transaction.
   */
  @Post('batch')
  async createBatch(
    @Body() body: { order1: CreateOrderDto; order2: CreateOrderDto },
  ): Promise<{ ids: number[] }> {
    return this.ordersService.createBatch(body.order1, body.order2);
  }

  /**
   * POST /orders/batch-rollback — Batch with intentional failure.
   */
  @Post('batch-rollback')
  async createBatchWithRollback(
    @Body() body: { order1: CreateOrderDto; order2: CreateOrderDto },
  ): Promise<{ ids: number[] }> {
    try {
      return await this.ordersService.createBatchWithRollback(body.order1, body.order2);
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
