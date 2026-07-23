import { describe, it, expect } from 'vitest';
import { MockUnitOfWork } from '../src/testing/index';

describe('MockUnitOfWork', () => {
  it('executes the callback and returns its result', async () => {
    const uow = new MockUnitOfWork();
    const result = await uow.do(async () => 42);
    expect(result).toBe(42);
  });

  it('tracks call count', async () => {
    const uow = new MockUnitOfWork();
    await uow.do(async () => {});
    await uow.do(async () => {});
    expect(uow.calls).toHaveLength(2);
  });

  it('tracks per-call options', async () => {
    const uow = new MockUnitOfWork();
    await uow.do(async () => {}, { timeout: 1000 });
    expect(uow.calls[0].options).toEqual({ timeout: 1000 });
  });

  it('calls are recorded in order', async () => {
    const uow = new MockUnitOfWork();
    await uow.do(async () => 'first');
    await uow.do(async () => 'second');
    expect(uow.calls).toHaveLength(2);
  });

  it('passes the client to the callback', async () => {
    const client = { foo: 'bar' };
    const uow = new MockUnitOfWork(client);
    let receivedTx: unknown;
    await uow.do(async (tx) => {
      receivedTx = tx;
    });
    expect(receivedTx).toBe(client);
  });

  it('transaction getter returns the configured client', () => {
    const client = { foo: 'bar' };
    const uow = new MockUnitOfWork(client);
    expect(uow.transaction).toBe(client);
  });

  it('uses an empty object as default client when none provided', () => {
    const uow = new MockUnitOfWork();
    expect(uow.transaction).toEqual({});
  });

  it('callbacks can use async operations', async () => {
    const uow = new MockUnitOfWork();
    const result = await uow.do(async () => {
      return new Promise<string>((resolve) => setTimeout(() => resolve('done'), 5));
    });
    expect(result).toBe('done');
  });
});
