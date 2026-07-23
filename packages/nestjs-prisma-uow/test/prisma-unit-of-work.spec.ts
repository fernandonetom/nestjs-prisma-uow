import { describe, it, expect, vi } from 'vitest';
import { PrismaUnitOfWork } from '../src/prisma-unit-of-work';
import type { TransactionOptions } from '../src/transaction-options';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockPrismaClient {
  root: boolean;
  $transaction: ReturnType<typeof vi.fn>;
}

function createMockPrisma(): { prisma: MockPrismaClient } {
  const $transaction = vi.fn();
  // Simulate a real PrismaClient shape: root object + $transaction
  return {
    prisma: {
      root: true,
      $transaction,
    },
  };
}

/**
 * Configure $transaction to call `fn(tx)` and return its result.
 * Each invocation creates a fresh tx object so we can assert identity.
 */
function setupTransactional(prisma: MockPrismaClient, makeTx: () => object = () => ({ __tx: {}, fresh: Math.random() })) {
  prisma.$transaction.mockImplementation(async (fn: (tx: object) => Promise<unknown>, _opts?: Record<string, unknown>) => {
    return fn(makeTx());
  });
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('PrismaUnitOfWork', () => {
  describe('do() — transaction boundaries', () => {
    it('opens $transaction on the outer do() call', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma);

      await uow.do(async () => 42);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('returns the callback result', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma);

      const result = await uow.do(async () => 99);
      expect(result).toBe(99);
    });

    it('propagates errors thrown inside the callback', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma);

      await expect(
        uow.do(async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('do() — nested reuse', () => {
    it('does NOT open a new transaction for a nested do() call', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma);

      await uow.do(async (outerTx) => {
        const inner = await uow.do(async (innerTx) => {
          return innerTx;
        });
        // Both the outer and inner tx should be the same object
        expect(inner).toBe(outerTx);
        return 42;
      });

      // $transaction must be called exactly once (the outer call)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('correctly reuses the same tx across multiple nested levels', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma);

      const txs: unknown[] = [];
      await uow.do(async (l1) => {
        txs.push(l1);
        await uow.do(async (l2) => {
          txs.push(l2);
          await uow.do(async (l3) => {
            txs.push(l3);
          });
        });
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // All three references must point to the same object
      expect(txs[0]).toBe(txs[1]);
      expect(txs[1]).toBe(txs[2]);
    });
  });

  describe('do() — ALS isolation', () => {
    it('isolates concurrent parallel do() calls', async () => {
      const { prisma } = createMockPrisma();
      // Each $transaction call creates a unique tx
      let callCount = 0;
      prisma.$transaction.mockImplementation(async (fn: (tx: object) => Promise<object>) => {
        callCount++;
        return fn({ __tx: callCount }); // unique per invocation
      });

      const uow = new PrismaUnitOfWork(prisma);

      const [a, b] = await Promise.all([
        uow.do(async (tx) => tx),
        uow.do(async (tx) => tx),
      ]);

      // Two separate $transaction calls
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      // The tx objects must differ (each call got its own context)
      expect(a).not.toBe(b);
      expect(a).toEqual({ __tx: 1 });
      expect(b).toEqual({ __tx: 2 });
    });

    it('does not leak tx across sequential do() calls', async () => {
      const { prisma } = createMockPrisma();
      let id = 0;
      prisma.$transaction.mockImplementation(async (fn: (tx: object) => Promise<object>) => {
        id++;
        return fn({ __tx: id });
      });

      const uow = new PrismaUnitOfWork(prisma);

      const r1 = await uow.do(async (tx) => tx);
      const r2 = await uow.do(async (tx) => tx);

      expect(r1).toEqual({ __tx: 1 });
      expect(r2).toEqual({ __tx: 2 });
      expect(r1).not.toBe(r2);
    });
  });

  describe('do() — transaction options', () => {
    it('passes default options to $transaction', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const defaults: TransactionOptions = { timeout: 5000, maxWait: 2000, isolationLevel: 'Serializable' };
      const uow = new PrismaUnitOfWork(prisma, defaults);

      await uow.do(async () => 42);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 5000,
        maxWait: 2000,
        isolationLevel: 'Serializable',
      });
    });

    it('per-call options override defaults', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const defaults: TransactionOptions = { timeout: 5000, maxWait: 2000 };
      const uow = new PrismaUnitOfWork(prisma, defaults);

      await uow.do(async () => 42, { timeout: 1000 });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 1000,
        maxWait: 2000,
      });
    });

    it('per-call isolationLevel overrides default', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const defaults: TransactionOptions = { isolationLevel: 'Serializable' };
      const uow = new PrismaUnitOfWork(prisma, defaults);

      await uow.do(async () => 42, { isolationLevel: 'ReadCommitted' });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'ReadCommitted',
      });
    });

    it('per-call options only apply when starting a new transaction (nested ignored)', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma, { timeout: 5000 });

      await uow.do(async () => {
        // Nested call passes options but they must be ignored
        await uow.do(async () => 42, { timeout: 100 });
      });

      // $transaction called once with default options
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
    });

    it('omits undefined options from the merged object', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma);

      await uow.do(async () => 42);

      // No options → second argument should be an empty object
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {});
    });

    it('handles partial defaults with partial overrides', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma, { timeout: 5000, isolationLevel: 'Serializable' });

      await uow.do(async () => 42, { maxWait: 1000 });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 5000,
        isolationLevel: 'Serializable',
        maxWait: 1000,
      });
    });
  });

  describe('transaction getter', () => {
    it('returns the root prisma client when outside a transaction', () => {
      const { prisma } = createMockPrisma();
      const uow = new PrismaUnitOfWork(prisma);

      expect(uow.transaction).toBe(prisma);
    });

    it('returns the active tx client when inside do()', async () => {
      const { prisma } = createMockPrisma();
      let capturedTx: unknown;
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma);

      await uow.do(async () => {
        capturedTx = uow.transaction;
        return 42;
      });

      expect(capturedTx).not.toBe(prisma);
    });

    it('returns the root prisma client again after do() completes', async () => {
      const { prisma } = createMockPrisma();
      setupTransactional(prisma);
      const uow = new PrismaUnitOfWork(prisma);

      await uow.do(async () => 42);
      expect(uow.transaction).toBe(prisma);
    });
  });
});
