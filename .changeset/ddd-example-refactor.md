---
"@feneto/nestjs-prisma-uow": patch
---

Refactor example app to full DDD layered architecture (domain/application/infrastructure/presentation) with DI-injected repositories sharing a single Unit of Work transaction. Add Product + User aggregate roots, batch create/rollback endpoints, and comprehensive documentation updates covering the DDD repository pattern, cross-aggregate orchestration, and testing DI-injected repositories.
