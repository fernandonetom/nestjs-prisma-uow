import { describe, it, expect } from 'vitest';

describe('public barrel exports', () => {
  it('exports PrismaUnitOfWork', async () => {
    const { PrismaUnitOfWork } = await import('../src/index');
    expect(PrismaUnitOfWork).toBeDefined();
    expect(typeof PrismaUnitOfWork).toBe('function');
  });

  it('exports PrismaUnitOfWorkModule', async () => {
    const { PrismaUnitOfWorkModule } = await import('../src/index');
    expect(PrismaUnitOfWorkModule).toBeDefined();
    expect(typeof PrismaUnitOfWorkModule.forRoot).toBe('function');
    expect(typeof PrismaUnitOfWorkModule.forRootAsync).toBe('function');
  });

  it('exports DI tokens as symbols', async () => {
    const { PRISMA_CLIENT, DEFAULT_TRANSACTION_OPTIONS } = await import('../src/index');
    expect(typeof PRISMA_CLIENT).toBe('symbol');
    expect(typeof DEFAULT_TRANSACTION_OPTIONS).toBe('symbol');
  });

  it('exports transactionStore as AsyncLocalStorage', async () => {
    const { transactionStore } = await import('../src/index');
    expect(transactionStore).toBeDefined();
    expect(typeof transactionStore.run).toBe('function');
  });
});
