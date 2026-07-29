import { Module } from '@nestjs/common';
import { PrismaUnitOfWorkModule } from '@feneto/nestjs-prisma-uow';

// Infrastructure
import { PrismaModule } from './infrastructure/prisma/prisma.module';

// Presentation (wires all layers)
import { OrdersModule } from './presentation/orders.module';

@Module({
  imports: [
    // 1. Register the consumer-owned Prisma client
    PrismaModule,

    // 2. Register the UoW module (global by default)
    PrismaUnitOfWorkModule.forRoot({
      imports: [PrismaModule],
      transactionOptions: { timeout: 5000 },
    }),

    // 3. Feature modules — presentation layer wires all dependencies
    OrdersModule,
  ],
})
export class AppModule {}
