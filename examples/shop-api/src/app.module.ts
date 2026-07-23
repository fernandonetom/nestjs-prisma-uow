import { Module } from '@nestjs/common';
import { PrismaUnitOfWorkModule } from '@feneto/nestjs-prisma-uow';
import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    // 1. Register the consumer-owned Prisma client
    PrismaModule,

    // 2. Register the UoW module (global by default)
    PrismaUnitOfWorkModule.forRoot({
      imports: [PrismaModule],
      transactionOptions: { timeout: 5000 },
    }),

    // 3. Feature modules
    OrdersModule,
  ],
})
export class AppModule {}
