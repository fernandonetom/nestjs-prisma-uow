# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

## Creating a changeset

When you make a change that affects the `@feneto/nestjs-prisma-uow` package, create a changeset:

```bash
pnpm changeset
```

Follow the prompts:
1. Select the `@feneto/nestjs-prisma-uow` package (the example `shop-api` is private and ignored).
2. Choose the semver bump: `patch`, `minor`, or `major`.
3. Write a summary of the change (this goes into `CHANGELOG.md`).

The CLI creates a markdown file in `.changeset/` — commit it with your PR.

## Release workflow

1. PRs merged to `main` trigger the `changesets/action@v2` GitHub Action.
2. The action opens (or updates) a **Version PR** that bumps versions and updates `CHANGELOG.md`.
3. When the Version PR is merged, the action publishes `@feneto/nestjs-prisma-uow` to npm.
