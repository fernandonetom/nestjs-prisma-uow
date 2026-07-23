import type { TransactionOptions } from './transaction-options';

/**
 * Unit of Work interface.
 *
 * Encapsulates a transactional boundary: all work inside `do()` runs
 * within a single database transaction. Nested `do()` calls reuse the
 * same transaction without opening a new one.
 *
 * @typeParam TClient — The transaction-capable client type (e.g. PrismaClient).
 *   Defaults to `unknown` for consumers that do not need strong types.
 */
export interface IUnitOfWork<TClient = unknown> {
  /**
   * Execute work inside a transaction boundary.
   *
   * If a transaction is already active (e.g. a nested call), the callback
   * receives the existing transaction client and no new transaction is opened.
   *
   * @param fn — The work to execute, receiving the transaction client.
   * @param options — Per-call transaction options. Only applied when a
   *   new transaction is started; ignored for nested calls.
   */
  do<TResult>(fn: (tx: TClient) => Promise<TResult>, options?: TransactionOptions): Promise<TResult>;

  /**
   * The active transaction client when inside a `do()` callback,
   * or the root (non-transactional) client when outside.
   */
  get transaction(): TClient;
}
