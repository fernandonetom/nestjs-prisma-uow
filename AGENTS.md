# AGENTS.md — Coding Agent Guide

This file helps coding agents (Claude Code, OpenCode, Cursor, etc.) understand how to work with this repository.

## Project Overview

This is a **pnpm workspace monorepo** containing:

- `packages/nestjs-prisma-uow/` — `@feneto/nestjs-prisma-uow`, a NestJS library implementing the Unit of Work pattern for Prisma.
- `examples/shop-api/` — Runnable NestJS example demonstrating the library with Order + OrderItem models.
- `docs/` — Developer documentation.

Key technologies: NestJS, Prisma, AsyncLocalStorage, Vitest, Changesets.

## Repository Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm -r build` | Build all packages |
| `pnpm -r typecheck` | TypeScript type-check all packages |
| `pnpm -r lint` | Lint all packages |
| `pnpm --filter @feneto/nestjs-prisma-uow test` | Run library unit tests |
| `pnpm --filter @feneto/nestjs-prisma-uow test:coverage` | Run tests with 90% coverage gate |
| `pnpm --filter @feneto/nestjs-prisma-uow test:integration` | Run integration tests (requires DATABASE_URL) |

## Architecture Principles

- **Library scope:** Only Unit of Work + Nest module + testing helpers. No PrismaService, no abstract base repository, no migrations runner in the library.
- **Transaction isolation:** `AsyncLocalStorage` per async call chain. Singleton provider safe under concurrency.
- **Consumer-owned Prisma:** Applications provide their own `PrismaClient`. The library imports only `@prisma/client` as a peer dependency.
- **Public API:** `IUnitOfWork`, `PrismaUnitOfWork`, `PrismaUnitOfWorkModule`, testing export at `@feneto/nestjs-prisma-uow/testing`.

## Module Wiring Pattern

```ts
// 1. Consumer defines a PrismaModule
@Module({
  providers: [{ provide: PRISMA_CLIENT, useClass: PrismaService }],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}

// 2. Register UoW module with the Prisma module as an import
@Module({
  imports: [
    PrismaModule,
    PrismaUnitOfWorkModule.forRoot({ imports: [PrismaModule] }),
  ],
})
export class AppModule {}

// 3. Inject PrismaUnitOfWork into services
@Injectable()
export class MyService {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}
}
```

## Testing

- **Unit tests:** Vitest with mocked Prisma client. 90% coverage threshold enforced.
- **Integration tests:** Real PostgreSQL. Skip when `DATABASE_URL` unset.
- **Example:** Manual verification via docker-compose + curl.

## Key Constraints

- Do not mention or reference any private/internal codebases (AC-20).
- Keep library surface minimal — no feature creep into ORM territory.
- Changes go through Changesets for versioning (T-09).

## Release Process

1. PR merged to `main`.
2. Changesets action opens a Version PR (or updates existing).
3. Merge Version PR → automated npm publish with provenance.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
