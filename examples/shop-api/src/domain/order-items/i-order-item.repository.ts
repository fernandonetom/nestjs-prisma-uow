/**
 * Repository contract for the OrderItem aggregate root.
 *
 * Lives in the domain layer — no infrastructure dependency.
 * Implemented by infrastructure/repositories/order-items.repository.ts
 */
export interface IOrderItemRepository {
  createItems(
    orderId: number,
    items: { product: string; quantity: number; price: number }[],
  ): Promise<{ count: number }>;
}
