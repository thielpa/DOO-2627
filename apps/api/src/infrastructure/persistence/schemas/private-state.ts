import { EntitySchema, type EntitySchemaMetadata } from "@mikro-orm/core";

/**
 * Domain classes keep their state in private fields (e.g. `_status`) and expose getters,
 * which MikroORM's typed `properties` can't see. This helper maps such a class by field name;
 * MikroORM reads and writes those fields directly, without calling domain methods.
 */
export function privateStateSchema<T>(
  // Only the class is needed, not a callable constructor, so domain classes may keep theirs
  // private (e.g. behind a factory like `Match.create`).
  entity: { prototype: T },
  meta: Omit<EntitySchemaMetadata<Record<string, unknown>>, "class" | "name">,
): EntitySchema<T> {
  return new EntitySchema({ class: entity, ...meta } as unknown as EntitySchemaMetadata<T>);
}
