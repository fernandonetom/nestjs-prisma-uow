import { Module, type DynamicModule, type FactoryProvider, type ValueProvider } from '@nestjs/common';
import { PrismaUnitOfWork } from './prisma-unit-of-work';
import { PRISMA_CLIENT, DEFAULT_TRANSACTION_OPTIONS } from './constants';
import type { TransactionOptions } from './transaction-options';

// ---------------------------------------------------------------------------
// Public configuration types
// ---------------------------------------------------------------------------

/** Options accepted by {@link PrismaUnitOfWorkModule.forRoot}. */
export interface PrismaUnitOfWorkModuleOptions {
  /**
   * Modules to import into this module's scope.
   *
   * Use this to bring your `PrismaModule` (the module that binds your
   * client to the `PRISMA_CLIENT` token) into scope so Nest can inject it.
   *
   * @example
   * ```ts
   * PrismaUnitOfWorkModule.forRoot({
   *   imports: [PrismaModule],
   *   transactionOptions: { timeout: 5000 },
   * })
   * ```
   */
  imports?: DynamicModule['imports'];

  /**
   * Whether the module should be registered as a global NestJS module
   * (available across the application without re-importing).
   *
   * @default true
   */
  isGlobal?: boolean;

  /**
   * Default transaction options applied to every new transaction.
   * Per-call overrides via {@link IUnitOfWork.do | `do(fn, options)`}
   * take precedence.
   */
  transactionOptions?: TransactionOptions;
}

/**
 * Async options for {@link PrismaUnitOfWorkModule.forRootAsync}.
 *
 * Mirrors the standard NestJS async factory pattern:
 * `useFactory` produces the transaction options; `imports` / `inject`
 * wire up any external dependencies the factory needs.
 */
export interface PrismaUnitOfWorkModuleAsyncOptions {
  isGlobal?: boolean;
  imports?: DynamicModule['imports'];
  inject?: FactoryProvider['inject'];
  useFactory: (...args: unknown[]) => TransactionOptions | Promise<TransactionOptions>;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

/**
 * NestJS module that provides `PrismaUnitOfWork` as an injectable singleton.
 *
 * **Prerequisites:** The consumer must bind their Prisma client (or wrapper) to
 * the injection token `PRISMA_CLIENT`. The typical pattern:
 *
 * ```ts
 * // prisma.module.ts
 * @Module({
 *   providers: [{ provide: PRISMA_CLIENT, useClass: PrismaService }],
 *   exports: [PRISMA_CLIENT],
 * })
 * export class PrismaModule {}
 * ```
 *
 * @example **forRoot (synchronous)**
 * ```ts
 * @Module({
 *   imports: [
 *     PrismaModule,
 *     PrismaUnitOfWorkModule.forRoot({
 *       transactionOptions: { timeout: 5000, isolationLevel: 'Serializable' },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example **forRootAsync**
 * ```ts
 * @Module({
 *   imports: [
 *     PrismaModule,
 *     PrismaUnitOfWorkModule.forRootAsync({
 *       useFactory: (config: ConfigService) => ({
 *         timeout: config.get('DB_TX_TIMEOUT'),
 *       }),
 *       inject: [ConfigService],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class PrismaUnitOfWorkModule {
  /**
   * Register the module synchronously with default transaction options.
   */
  static forRoot(options?: PrismaUnitOfWorkModuleOptions): DynamicModule {
    const transactionOptionsProvider: ValueProvider = {
      provide: DEFAULT_TRANSACTION_OPTIONS,
      useValue: options?.transactionOptions ?? {},
    };

    return {
      module: PrismaUnitOfWorkModule,
      global: options?.isGlobal ?? true,
      imports: options?.imports ?? [],
      providers: [transactionOptionsProvider, this.buildUowProvider()],
      exports: [PrismaUnitOfWork],
    };
  }

  /**
   * Register the module asynchronously with factory-provided transaction options.
   */
  static forRootAsync(options: PrismaUnitOfWorkModuleAsyncOptions): DynamicModule {
    const transactionOptionsProvider: FactoryProvider = {
      provide: DEFAULT_TRANSACTION_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject ?? [],
    };

    return {
      module: PrismaUnitOfWorkModule,
      global: options.isGlobal ?? true,
      imports: options.imports ?? [],
      providers: [transactionOptionsProvider, this.buildUowProvider()],
      exports: [PrismaUnitOfWork],
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private static buildUowProvider(): FactoryProvider {
    return {
      provide: PrismaUnitOfWork,
      useFactory: (prisma: unknown, options: TransactionOptions) =>
        new PrismaUnitOfWork(prisma, options),
      inject: [PRISMA_CLIENT, DEFAULT_TRANSACTION_OPTIONS],
    };
  }
}
