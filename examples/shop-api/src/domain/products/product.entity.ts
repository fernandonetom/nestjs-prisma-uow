/**
 * Product entity.
 *
 * Represents a catalog product. Read-only aggregate root
 * in the context of order creation.
 */
export class Product {
  constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly price: number,
  ) {}
}
