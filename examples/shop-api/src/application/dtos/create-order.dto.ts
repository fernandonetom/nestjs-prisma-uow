/**
 * Data Transfer Object for order creation requests.
 *
 * Lives in the application layer — bridges presentation and domain.
 */
export interface CreateOrderDto {
  customer: string;
  email: string;
  items: { product: string; quantity: number; price: number }[];
}
