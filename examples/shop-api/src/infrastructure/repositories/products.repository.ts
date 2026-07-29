import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import type { IProductRepository } from '../../domain/products/i-product.repository';
import { Product } from '../../domain/products/product.entity';

/**
 * Infrastructure implementation of IProductRepository.
 *
 * Maps Prisma models to Product domain entities.
 */
@Injectable()
export class ProductsRepository implements IProductRepository {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async findByIds(ids: number[]): Promise<Product[]> {
    const client = this.uow.transaction;
    const results = await client.product.findMany({
      where: { id: { in: ids } },
    });
    return results.map((r) => new Product(r.id, r.name, r.price));
  }

  async findByNames(names: string[]): Promise<Product[]> {
    const client = this.uow.transaction;
    const results = await client.product.findMany({
      where: { name: { in: names } },
    });
    return results.map((r) => new Product(r.id, r.name, r.price));
  }

  async create(params: { name: string; price: number }): Promise<Product> {
    const client = this.uow.transaction;
    const result = await client.product.create({
      data: { name: params.name, price: params.price },
    });
    return new Product(result.id, result.name, result.price);
  }
}
