/**
 * OrderItem entity.
 *
 * Belongs to the Order aggregate but is a standalone entity
 * for cross-aggregate transaction demonstration.
 */
export class OrderItem {
  constructor(
    public readonly id: number,
    public readonly orderId: number,
    public readonly product: string,
    public readonly quantity: number,
    public readonly price: number,
  ) {}
}
