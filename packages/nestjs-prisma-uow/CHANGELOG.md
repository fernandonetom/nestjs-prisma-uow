# Changelog

## 0.1.3

### Patch Changes

- 8a544c3: Refactor example app to full DDD layered architecture (domain/application/infrastructure/presentation) with DI-injected repositories sharing a single Unit of Work transaction. Add Product + User aggregate roots, batch create/rollback endpoints, and comprehensive documentation updates covering the DDD repository pattern, cross-aggregate orchestration, and testing DI-injected repositories.

## 0.1.2

### Patch Changes

- 2392a12: Fix broken GitHub links in package README (wrong username on npm package page)

## 0.1.1

### Patch Changes

- 8d1f69d: Fix README links to absolute GitHub URLs for npm compatibility and add repository/homepage/bugs fields to package.json

## 0.1.0

### Minor Changes

- 60a5130: Initial release: NestJS Prisma Unit of Work library with transactional boundaries, AsyncLocalStorage isolation, NestJS module (forRoot/forRootAsync), MockUnitOfWork testing helper, and 90%+ test coverage.

All notable changes to this project will be documented in this file.

This file is managed by [Changesets](https://github.com/changesets/changesets).

## 0.0.0

- Initial pre-release. Package scaffold, public API, and CI/CD setup in progress.
