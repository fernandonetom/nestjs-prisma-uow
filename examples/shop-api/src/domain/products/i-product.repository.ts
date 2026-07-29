import type { Product } from './product.entity';

/**
 * Repository contract for the Product aggregate root.
 *
 * Lives in the domain layer — no infrastructure dependency.
 * Implemented by infrastructure/repositories/products.repository.ts
 */
export interface IProductRepository {
  findByIds(ids: number[]): Promise<Product[]>;
  findByNames(names: string[]): Promise<Product[]>;
  create(params: { name: string; price: number }): Promise<Product>;
}
