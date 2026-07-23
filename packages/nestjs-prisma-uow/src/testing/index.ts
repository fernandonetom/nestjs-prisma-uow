import type { IUnitOfWork } from '../i-unit-of-work';
import type { TransactionOptions } from '../transaction-options';

/**
 * A stub / mock Unit of Work suitable for consumer unit tests.
 *
 * Executes the callback immediately (no real database transaction) and
 * records every `do()` call so tests can inspect call count, arguments,
 * and sequences.
 *
 * @typeParam TClient — The consumer's client type (e.g. PrismaClient).
 *
 * @example **Basic usage**
 * ```ts
 * import { MockUnitOfWork } from '@feneto/nestjs-prisma-uow/testing';
 *
 * const uow = new MockUnitOfWork(mockPrismaClient);
 * const result = await uow.do(async (tx) => {
 *   return tx.user.findMany();
 * });
 * expect(uow.calls).toHaveLength(1);
 * ```
 */
export class MockUnitOfWork<TClient = unknown> implements IUnitOfWork<TClient> {
  private readonly _calls: Array<{ fn: (tx: TClient) => Promise<unknown>; options?: TransactionOptions }> = [];
  private readonly _client: TClient;

  /**
   * @param client — A mock/stub client exposed by the `transaction` getter.
   *   When omitted, an empty object is used.
   */
  constructor(client?: TClient) {
    this._client = client ?? ({} as TClient);
  }

  /** @inheritdoc */
  get transaction(): TClient {
    return this._client;
  }

  /** @inheritdoc */
  async do<TResult>(fn: (tx: TClient) => Promise<TResult>, options?: TransactionOptions): Promise<TResult> {
    this._calls.push({ fn: fn as (tx: TClient) => Promise<unknown>, options });
    return fn(this._client);
  }

  /**
   * Ordered list of every `do()` invocation.
   *
   * Use for asserting call count, call order, and per-call options.
   */
  get calls(): ReadonlyArray<{ fn: (tx: TClient) => Promise<unknown>; options?: TransactionOptions }> {
    return this._calls;
  }
}
