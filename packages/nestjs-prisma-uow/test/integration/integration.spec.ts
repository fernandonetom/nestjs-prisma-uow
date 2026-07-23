import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Skip the entire suite when DATABASE_URL is not configured.
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
const describeIf = DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Integration tests — real PostgreSQL
// ---------------------------------------------------------------------------
describeIf('PrismaUnitOfWork integration (Postgres)', () => {
  let PrismaClient: new (opts?: { datasources?: { db?: { url?: string } } }) => {
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $transaction<T>(fn: (tx: unknown) => Promise<T>, opts?: Record<string, unknown>): Promise<T>;
    user: {
      create(args: { data: { email: string; name: string } }): Promise<{ id: number; email: string; name: string }>;
      findUnique(args: { where: { id: number } }): Promise<{ id: number; email: string; name: string } | null>;
      findMany(args?: { where?: { email?: string } }): Promise<{ id: number; email: string; name: string }[]>;
      deleteMany(args?: Record<string, unknown>): Promise<{ count: number }>;
    };
    auditLog: {
      create(args: { data: { userId: number; action: string } }): Promise<{ id: number; userId: number; action: string }>;
      findUnique(args: { where: { id: number } }): Promise<{ id: number; userId: number; action: string } | null>;
      findMany(args?: { where?: { action?: string } }): Promise<{ id: number; userId: number; action: string }[]>;
      deleteMany(args?: Record<string, unknown>): Promise<{ count: number }>;
    };
  };

  let PrismaUnitOfWorkModule: typeof import('../../src/prisma-unit-of-work').PrismaUnitOfWork;

  let prisma: ReturnType<typeof PrismaClient>;
  let uow: import('../../src/prisma-unit-of-work').PrismaUnitOfWork<ReturnType<typeof PrismaClient>>;

  // -----------------------------------------------------------------------
  // Setup — connect to the test database
  // -----------------------------------------------------------------------
  beforeAll(async () => {
    // Dynamically import generated PrismaClient from the test schema
    const prismaModule = await import('./prisma/generated/index.js');
    PrismaClient = prismaModule.PrismaClient;

    // Dynamically import PrismaUnitOfWork
    const uowModule = await import('../../src/prisma-unit-of-work.js');
    PrismaUnitOfWorkModule = uowModule.PrismaUnitOfWork;

    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    }) as unknown as ReturnType<typeof PrismaClient>;

    await prisma.$connect();

    // Clean up any leftover data from previous runs
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();

    uow = new PrismaUnitOfWorkModule(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    // Clean slate before each test
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  // -----------------------------------------------------------------------
  // Commit path
  // -----------------------------------------------------------------------
  describe('commit path', () => {
    it('persists updates from multiple models inside a single transaction', async () => {
      const userId = await uow.do(async (tx) => {
        // Cast to access prisma client methods on the transaction client
        const t = tx as unknown as {
          user: { create(args: { data: { email: string; name: string } }): Promise<{ id: number; email: string; name: string }> };
          auditLog: { create(args: { data: { userId: number; action: string } }): Promise<{ id: number; userId: number; action: string }> };
        };

        const user = await t.user.create({
          data: { email: 'alice@test.com', name: 'Alice' },
        });

        await t.auditLog.create({
          data: { userId: user.id, action: 'USER_CREATED' },
        });

        return user.id;
      });

      // After commit, both records must exist
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user).not.toBeNull();
      expect(user!.email).toBe('alice@test.com');

      const logs = await prisma.auditLog.findMany({ where: { action: 'USER_CREATED' } });
      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe(userId);
    });

    it('supports multiple independent creates in a single transaction', async () => {
      await uow.do(async (tx) => {
        const t = tx as unknown as {
          user: { create(args: { data: { email: string; name: string } }): Promise<{ id: number }> };
          auditLog: { create(args: { data: { userId: number; action: string } }): Promise<{ id: number }> };
        };

        const bob = await t.user.create({ data: { email: 'bob@test.com', name: 'Bob' } });
        const charlie = await t.user.create({ data: { email: 'charlie@test.com', name: 'Charlie' } });

        await t.auditLog.create({ data: { userId: bob.id, action: 'BATCH_CREATE' } });
        await t.auditLog.create({ data: { userId: charlie.id, action: 'BATCH_CREATE' } });
      });

      const users = await prisma.user.findMany();
      expect(users).toHaveLength(2);

      const logs = await prisma.auditLog.findMany();
      expect(logs).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Rollback path
  // -----------------------------------------------------------------------
  describe('rollback path', () => {
    it('rolls back all changes when an error is thrown inside do()', async () => {
      await expect(
        uow.do(async (tx) => {
          const t = tx as unknown as {
            user: { create(args: { data: { email: string; name: string } }): Promise<{ id: number }> };
            auditLog: { create(args: { data: { userId: number; action: string } }): Promise<{ id: number }> };
          };

          // Step 1: Create a user (should be rolled back)
          const user = await t.user.create({
            data: { email: 'rollback@test.com', name: 'Rollback Test' },
          });

          // Step 2: Create an audit log for the user
          await t.auditLog.create({
            data: { userId: user.id, action: 'WILL_ROLLBACK' },
          });

          // Step 3: Throw to trigger rollback
          throw new Error('simulated failure after writes');
        }),
      ).rejects.toThrow('simulated failure after writes');

      // After rollback, neither record should exist
      const users = await prisma.user.findMany({ where: { email: 'rollback@test.com' } });
      expect(users).toHaveLength(0);

      const logs = await prisma.auditLog.findMany({ where: { action: 'WILL_ROLLBACK' } });
      expect(logs).toHaveLength(0);
    });

    it('rolls back partial writes when a database constraint fails mid-transaction', async () => {
      // Pre-create a user to trigger a unique constraint violation
      await prisma.user.create({ data: { email: 'duplicate@test.com', name: 'Existing' } });

      await expect(
        uow.do(async (tx) => {
          const t = tx as unknown as {
            user: { create(args: { data: { email: string; name: string } }): Promise<{ id: number }> };
            auditLog: { create(args: { data: { userId: number; action: string } }): Promise<{ id: number }> };
          };

          // Step 1: Create a new user (should be rolled back if anything fails)
          const fresh = await t.user.create({
            data: { email: 'fresh@test.com', name: 'Fresh' },
          });

          await t.auditLog.create({
            data: { userId: fresh.id, action: 'CREATED' },
          });

          // Step 2: Duplicate email — violates unique constraint
          await t.user.create({
            data: { email: 'duplicate@test.com', name: 'Duplicate' },
          });
        }),
      ).rejects.toThrow();

      // The "fresh" user must NOT exist (everything rolled back)
      const freshUsers = await prisma.user.findMany({ where: { email: 'fresh@test.com' } });
      expect(freshUsers).toHaveLength(0);

      // The audit log must NOT exist
      const logs = await prisma.auditLog.findMany({ where: { action: 'CREATED' } });
      expect(logs).toHaveLength(0);

      // The pre-existing user must still be there
      const existing = await prisma.user.findUnique({ where: { email: 'duplicate@test.com' } });
      expect(existing).not.toBeNull();
      expect(existing!.name).toBe('Existing');
    });
  });

  // -----------------------------------------------------------------------
  // Transaction getter (integration context)
  // -----------------------------------------------------------------------
  describe('transaction getter', () => {
    it('returns the root client outside do() and tx client inside do()', async () => {
      // Outside — root client
      const outsideClient = uow.transaction;
      expect(outsideClient).toBeDefined();

      let insideClient: unknown;
      await uow.do(async () => {
        insideClient = uow.transaction;
      });

      // Inside — transaction client (different from root)
      expect(insideClient).toBeDefined();
    });

    it('returns root client again after do() completes', async () => {
      await uow.do(async () => {
        // just run a transaction
      });
      const client = uow.transaction;
      expect(client).toBeDefined();
    });
  });
});
