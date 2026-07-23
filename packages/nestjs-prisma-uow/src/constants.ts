/**
 * DI injection tokens used by PrismaUnitOfWorkModule.
 *
 * Consumers bind their Prisma client to `PRISMA_CLIENT` and the module
 * reads it to construct the `PrismaUnitOfWork` provider.
 */
export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

/**
 * Token for injecting default transaction options into `PrismaUnitOfWork`.
 */
export const DEFAULT_TRANSACTION_OPTIONS = Symbol('DEFAULT_TRANSACTION_OPTIONS');
