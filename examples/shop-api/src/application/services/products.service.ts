import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import type { Product } from '../../domain/products/product.entity';
import { ProductsRepository } from '../../infrastructure/repositories/products.repository';

/**
 * Application service for Product aggregate operations.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly productRepo: ProductsRepository,
    private readonly uow: PrismaUnitOfWork<PrismaClient>,
  ) {}

  async createProduct(params: { name: string; price: number }): Promise<Product> {
    return this.uow.do(async () => {
      return this.productRepo.create(params);
    });
  }
}
