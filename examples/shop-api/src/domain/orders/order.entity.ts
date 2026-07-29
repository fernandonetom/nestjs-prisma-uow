import type { OrderItem } from '../order-items/order-item.entity';

/**
 * Order aggregate root entity.
 *
 * Pure domain object — no ORM dependency.
 * Enforces order invariants and exposes behavior.
 */
export class Order {
  private _items: OrderItem[] = [];

  constructor(
    public readonly id: number,
    public readonly customer: string,
    public readonly email: string,
    public readonly createdAt: Date,
  ) {}

  /** Items are add-only through the aggregate root. */
  get items(): ReadonlyArray<OrderItem> {
    return this._items;
  }

  /** Attach an item to this order. Called during order creation. */
  addItem(item: OrderItem): void {
    this._items.push(item);
  }
}
