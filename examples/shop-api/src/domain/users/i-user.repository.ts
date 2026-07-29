import type { User } from './user.entity';

/**
 * Repository contract for the User aggregate root.
 *
 * Lives in the domain layer — no infrastructure dependency.
 * Implemented by infrastructure/repositories/users.repository.ts
 */
export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  create(params: { email: string; name: string }): Promise<User>;
}
