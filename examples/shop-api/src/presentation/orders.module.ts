import { Module } from '@nestjs/common';

// Presentation
import { OrdersController } from './controllers/orders.controller';

// Application
import { OrdersService } from '../application/services/orders.service';

// Infrastructure
import { OrdersRepository } from '../infrastructure/repositories/orders.repository';
import { OrderItemsRepository } from '../infrastructure/repositories/order-items.repository';
import { ProductsRepository } from '../infrastructure/repositories/products.repository';

/**
 * Feature module wiring the Order flow across layers.
 *
 * Presentation → Application → Infrastructure
 * Imports repository providers so they are injectable
 * into the OrdersService.
 */
@Module({
  providers: [
    OrdersService,
    OrdersRepository,
    OrderItemsRepository,
    ProductsRepository,
  ],
  controllers: [OrdersController],
})
export class OrdersModule {}
