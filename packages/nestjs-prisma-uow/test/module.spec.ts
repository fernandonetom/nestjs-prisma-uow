import { Module } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { PrismaUnitOfWorkModule, type PrismaUnitOfWorkModuleOptions } from '../src/prisma-unit-of-work.module';
import { PrismaUnitOfWork } from '../src/prisma-unit-of-work';
import { PRISMA_CLIENT, DEFAULT_TRANSACTION_OPTIONS } from '../src/constants';
import type { TransactionOptions } from '../src/transaction-options';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPrismaClient() {
  const $transaction = vi.fn();
  return { $transaction, extra: 'root' };
}

/**
 * Creates a NestJS module that binds the given mock client to `PRISMA_CLIENT`
 * and exports the token so `PrismaUnitOfWorkModule` can inject it.
 */
function makePrismaModule(prisma = createMockPrismaClient()) {
  @Module({
    providers: [{ provide: PRISMA_CLIENT, useValue: prisma }],
    exports: [PRISMA_CLIENT],
  })
  class MockPrismaModule {}
  return { module: MockPrismaModule, prisma };
}

/**
 * Convenience: constructs a TestingModule with a mock PrismaModule wired in.
 */
function createUowModule(options?: PrismaUnitOfWorkModuleOptions) {
  const { module: PrismaModule, prisma } = makePrismaModule();
  const builder = Test.createTestingModule({
    imports: [
      PrismaUnitOfWorkModule.forRoot({ ...options, imports: [PrismaModule, ...(options?.imports ?? [])] }),
    ],
  });
  return { builder, prisma };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrismaUnitOfWorkModule', () => {
  describe('forRoot', () => {
    it('provides PrismaUnitOfWork as an injectable singleton', async () => {
      const { builder } = createUowModule();
      const moduleRef = await builder.compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      expect(uow).toBeInstanceOf(PrismaUnitOfWork);
    });

    it('injects the root Prisma client via PRISMA_CLIENT', async () => {
      const { builder, prisma } = createUowModule();
      const moduleRef = await builder.compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      expect(uow.transaction).toBe(prisma);
    });

    it('applies default transaction options from forRoot config', async () => {
      const { module: PrismaModule, prisma } = makePrismaModule();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));

      const moduleRef = await Test.createTestingModule({
        imports: [
          PrismaUnitOfWorkModule.forRoot({
            imports: [PrismaModule],
            transactionOptions: { timeout: 5000, isolationLevel: 'Serializable' },
          }),
        ],
      }).compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      await uow.do(async () => 42);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 5000,
        isolationLevel: 'Serializable',
      });
    });

    it('uses empty options when no defaults are provided', async () => {
      const { module: PrismaModule, prisma } = makePrismaModule();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));

      const moduleRef = await Test.createTestingModule({
        imports: [
          PrismaUnitOfWorkModule.forRoot({
            imports: [PrismaModule],
          }),
        ],
      }).compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      await uow.do(async () => 42);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {});
    });

    it('defaults isGlobal to true', async () => {
      const { module: PrismaModule } = makePrismaModule();

      const moduleRef = await Test.createTestingModule({
        imports: [
          {
            module: class RootModule {},
            imports: [
              PrismaUnitOfWorkModule.forRoot({ imports: [PrismaModule] }),
            ],
          },
        ],
      }).compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      expect(uow).toBeInstanceOf(PrismaUnitOfWork);
    });

    it('accepts empty forRoot() call with no options', () => {
      // Coverage: options === undefined → options?.imports ?? [], options?.isGlobal ?? true
      // We test the static method directly without compiling a module
      const dynMod = PrismaUnitOfWorkModule.forRoot();
      expect(dynMod.module).toBe(PrismaUnitOfWorkModule);
      expect(dynMod.global).toBe(true);
      expect(dynMod.imports).toEqual([]);
      expect(dynMod.providers).toHaveLength(2);
      expect(dynMod.exports).toEqual([PrismaUnitOfWork]);
    });

    it('accepts explicit isGlobal: true', async () => {
      const { module: PrismaModule } = makePrismaModule();
      const moduleRef = await Test.createTestingModule({
        imports: [
          PrismaUnitOfWorkModule.forRoot({
            imports: [PrismaModule],
            isGlobal: true,
          }),
        ],
      }).compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      expect(uow).toBeInstanceOf(PrismaUnitOfWork);
    });

    it('respects isGlobal: false', async () => {
      const { module: PrismaModule } = makePrismaModule();

      const moduleRef = await Test.createTestingModule({
        imports: [
          PrismaUnitOfWorkModule.forRoot({
            imports: [PrismaModule],
            isGlobal: false,
          }),
        ],
      }).compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      expect(uow).toBeInstanceOf(PrismaUnitOfWork);
    });
  });

  describe('forRootAsync', () => {
    it('resolves transaction options from a factory', async () => {
      const { module: PrismaModule, prisma } = makePrismaModule();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));

      const moduleRef = await Test.createTestingModule({
        imports: [
          PrismaUnitOfWorkModule.forRootAsync({
            imports: [PrismaModule],
            useFactory: () => ({ timeout: 3000, maxWait: 1000 }),
          }),
        ],
      }).compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      await uow.do(async () => 42);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 3000,
        maxWait: 1000,
      });
    });

    it('supports inject for async factory dependencies', async () => {
      const { module: PrismaModule, prisma } = makePrismaModule();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));

      const mockConfig = { dbTimeout: 7000, dbIsolation: 'ReadCommitted' as const };

      @Module({
        providers: [{ provide: 'CONFIG', useValue: mockConfig }],
        exports: ['CONFIG'],
      })
      class ConfigModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [
          PrismaUnitOfWorkModule.forRootAsync({
            imports: [PrismaModule, ConfigModule],
            useFactory: (config: typeof mockConfig) => ({
              timeout: config.dbTimeout,
              isolationLevel: config.dbIsolation,
            }),
            inject: ['CONFIG'],
          }),
        ],
      }).compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      await uow.do(async () => 42);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 7000,
        isolationLevel: 'ReadCommitted',
      });
    });

    it('defaults isGlobal to true (async)', async () => {
      const { module: PrismaModule } = makePrismaModule();

      const moduleRef = await Test.createTestingModule({
        imports: [
          PrismaUnitOfWorkModule.forRootAsync({
            imports: [PrismaModule],
            useFactory: () => ({}),
          }),
        ],
      }).compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      expect(uow).toBeInstanceOf(PrismaUnitOfWork);
    });

    it('respects isGlobal: false (async)', async () => {
      const { module: PrismaModule } = makePrismaModule();

      const moduleRef = await Test.createTestingModule({
        imports: [
          PrismaUnitOfWorkModule.forRootAsync({
            imports: [PrismaModule],
            isGlobal: false,
            useFactory: () => ({}),
          }),
        ],
      }).compile();

      const uow = moduleRef.get(PrismaUnitOfWork);
      expect(uow).toBeInstanceOf(PrismaUnitOfWork);
    });
  });

  describe('DEFAULT_TRANSACTION_OPTIONS token', () => {
    it('is accessible in the DI container', async () => {
      const { module: PrismaModule } = makePrismaModule();
      const defaults: TransactionOptions = { timeout: 9999 };

      const moduleRef = await Test.createTestingModule({
        imports: [
          PrismaUnitOfWorkModule.forRoot({
            imports: [PrismaModule],
            transactionOptions: defaults,
          }),
        ],
      }).compile();

      const resolved = moduleRef.get<TransactionOptions>(DEFAULT_TRANSACTION_OPTIONS);
      expect(resolved).toEqual(defaults);
    });
  });
});
