/**
 * Supported transaction isolation levels.
 *
 * Values match Prisma's `TransactionIsolationLevel` enum so consumers
 * can pass literal strings without importing Prisma types.
 */
export type IsolationLevel =
  | 'ReadUncommitted'
  | 'ReadCommitted'
  | 'RepeatableRead'
  | 'Snapshot'
  | 'Serializable';

/**
 * Transaction options that can be set globally (on the module) or per-call.
 *
 * All fields are optional. Per-call options override global defaults.
 */
export interface TransactionOptions {
  /** Maximum time (ms) the client waits for the transaction to complete. */
  timeout?: number;

  /** Maximum time (ms) the client waits to acquire a lock. */
  maxWait?: number;

  /** Transaction isolation level for the Prisma interactive transaction. */
  isolationLevel?: IsolationLevel;
}
