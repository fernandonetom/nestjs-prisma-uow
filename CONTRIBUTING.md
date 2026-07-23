# Contributing

Thank you for considering contributing to `@feneto/nestjs-prisma-uow`!

## Development Setup

```bash
# Clone and install
git clone <repo-url>
cd nestjs-prisma-uow
pnpm install

# Build the library
pnpm --filter @feneto/nestjs-prisma-uow build

# Run tests
pnpm --filter @feneto/nestjs-prisma-uow test

# Run with coverage
pnpm --filter @feneto/nestjs-prisma-uow test:coverage
```

## Monorepo Layout

```
packages/nestjs-prisma-uow/   # Publishable library
examples/shop-api/            # Runnable example app
docs/                         # Developer documentation
```

## Tooling

- **pnpm** — Workspace package manager
- **TypeScript** — Strict mode, ES2022 target
- **Vitest** — Test runner with 90% coverage threshold
- **ESLint** — Linting (typescript-eslint)
- **Changesets** — Versioning and changelog management

## Running the Example

```bash
cd examples/shop-api
docker compose up -d
cp .env.example .env
pnpm --filter shop-api prisma:push
pnpm --filter shop-api build
pnpm --filter shop-api start
```

## Pull Requests

1. Fork and create a feature branch.
2. Make changes with tests where applicable.
3. Run `pnpm -r typecheck && pnpm -r lint && pnpm --filter @feneto/nestjs-prisma-uow test:coverage`.
4. Add a changeset if needed: `pnpm changeset`.
5. Open a PR targeting `main`.

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/) for clear changelogs.

## Code of Conduct

Be respectful. Assume good faith. Keep feedback constructive.
