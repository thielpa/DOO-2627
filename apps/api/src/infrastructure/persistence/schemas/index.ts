import type { EntitySchema } from "@mikro-orm/core";
import { CategorySchema } from "./category.schema";
import { LobbySchema } from "./lobby.schema";
import { MatchSchema, PlayerAnswerSchema, RoundSchema } from "./match.schema";
import { AnswerOptionSchema, QuestionSchema } from "./question.schema";

// Register an EntitySchema here for every domain class that gets persisted.
// The mapping lives in this layer so the domain classes stay free of ORM code.
export const schemas: EntitySchema[] = [
  CategorySchema,
  AnswerOptionSchema,
  QuestionSchema,
  LobbySchema,
  PlayerAnswerSchema,
  RoundSchema,
  MatchSchema,
] as EntitySchema[];
