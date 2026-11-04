# Architecture

This project is used to practise object-oriented design, Domain-Driven Design (DDD) and OOP.
Its architecture puts the domain model in the centre and keeps frameworks at the edges.

## Packages

| Package           | Role                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `packages/domain` | Domain model: plain TypeScript classes                           |
| `apps/api`        | Application services + adapters (HTTP via Hono, DB via MikroORM) |
| `apps/web`        | React UI                                                         |

## Where the DDD building blocks go

| Building block                                | Location                                                |
| --------------------------------------------- | ------------------------------------------------------- |
| Aggregates, entities, value objects           | `packages/domain/src/<bounded-context>/`                |
| Domain services, domain events                | `packages/domain/src/<bounded-context>/`                |
| Repository **interfaces**                     | `packages/domain/src/<bounded-context>/`                |
| Use cases / application services              | `apps/api/src/application/`                             |
| Persistence mapping (`EntitySchema`)          | `apps/api/src/infrastructure/persistence/schemas/`      |
| Repository **implementations**                | `apps/api/src/infrastructure/persistence/repositories/` |
| HTTP routes / controllers                     | `apps/api/src/http/routes/`                             |
| Wiring everything together (composition root) | `apps/api/src/main.ts`                                  |

## Persistence

MikroORM is a data-mapper ORM with Unit of Work and Identity Map. The mapping between domain
classes and tables is defined with `EntitySchema` in the infrastructure layer, so domain classes
need no decorators. Every HTTP request gets its own `EntityManager` fork (see `http/app.ts`).

To persist a new domain class:
1. Write the class in `packages/domain`.
2. Add an `EntitySchema` for it in `infrastructure/persistence/schemas/` and register it in
   `schemas/index.ts`.
3. Implement the domain's repository interface in `infrastructure/persistence/repositories/`.
4. Create a migration: `bun run --filter @languageduel/api orm migration:create`.
