/**
 * User entity.
 *
 * Represents a customer who places orders. Read-only aggregate root
 * in the context of order creation.
 */
export class User {
  constructor(
    public readonly id: number,
    public readonly email: string,
    public readonly name: string,
  ) {}
}
