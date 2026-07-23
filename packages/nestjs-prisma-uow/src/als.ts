import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Shared AsyncLocalStorage that isolates the active transaction client
 * per async call chain.
 *
 * Concurrent requests to a singleton `PrismaUnitOfWork` provider do not
 * share transaction state — each async chain sees its own value or
 * `undefined` when no transaction is active.
 */
export const transactionStore = new AsyncLocalStorage<unknown>();
