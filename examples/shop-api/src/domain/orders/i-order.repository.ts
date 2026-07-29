import type { Order } from './order.entity';

/**
 * Repository contract for the Order aggregate root.
 *
 * Lives in the domain layer — no infrastructure dependency.
 * Implemented by infrastructure/repositories/orders.repository.ts
 */
export interface IOrderRepository {
  save(customer: string, email: string, createdAt?: Date): Promise<Order>;
  findById(id: number): Promise<Order | null>;
  findByCustomer(customer: string): Promise<Order[]>;
}
