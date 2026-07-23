import { transactionStore } from './als';
import type { IUnitOfWork } from './i-unit-of-work';
import type { TransactionOptions } from './transaction-options';

/**
 * Prisma implementation of {@link IUnitOfWork}.
 *
 * Wraps Prisma's interactive `$transaction` API with nested-call reuse
 * and per-async-chain isolation via `AsyncLocalStorage`.
 *
 * @typeParam TClient — The consumer's Prisma client type or an extended
 *   wrapper. Defaults to `unknown` for maximum compatibility.
 *
 * @example
 * ```ts
 * const uow = new PrismaUnitOfWork(prisma);
 * await uow.do(async (tx) => {
 *   await tx.user.create({ data: { name: 'Alice' } });
 *   await tx.order.create({ data: { userId: 1 } });
 * });
 * ```
 */
export class PrismaUnitOfWork<TClient = unknown> implements IUnitOfWork<TClient> {
  /**
   * @param prisma — The consumer's Prisma client (or wrapper providing `$transaction`).
   * @param defaultOptions — Default transaction options applied to every new transaction.
   */
  constructor(
    private readonly prisma: TClient,
    private readonly defaultOptions: TransactionOptions = {},
  ) {}

  /** @inheritdoc */
  async do<TResult>(fn: (tx: TClient) => Promise<TResult>, options?: TransactionOptions): Promise<TResult> {
    const existing = transactionStore.getStore();
    if (existing !== undefined) {
      // Already inside a transaction — reuse the active client.
      return fn(existing as TClient);
    }

    // No active transaction — open a new Prisma interactive transaction.
    const merged: Record<string, unknown> = {};
    const opts = this.defaultOptions;
    if (opts.timeout !== undefined) merged.timeout = opts.timeout;
    if (opts.maxWait !== undefined) merged.maxWait = opts.maxWait;
    if (opts.isolationLevel !== undefined) merged.isolationLevel = opts.isolationLevel;

    if (options) {
      if (options.timeout !== undefined) merged.timeout = options.timeout;
      if (options.maxWait !== undefined) merged.maxWait = options.maxWait;
      if (options.isolationLevel !== undefined) merged.isolationLevel = options.isolationLevel;
    }

    // Cast to `any` because `TClient` may not expose `$transaction` in the type system,
    // but at runtime the consumer guarantees their client has it.
    const client = this.prisma as unknown as { $transaction: (...args: unknown[]) => Promise<unknown> };

    return client.$transaction((tx: unknown) => {
      return transactionStore.run(tx, () => fn(tx as TClient));
    }, merged) as Promise<TResult>;
  }

  /** @inheritdoc */
  get transaction(): TClient {
    return (transactionStore.getStore() as TClient | undefined) ?? this.prisma;
  }
}
