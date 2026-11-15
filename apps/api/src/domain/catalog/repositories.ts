import type { Category } from "./category";
import type { Difficulty } from "./difficulty";
import type { Question } from "./question";

export interface QuestionRepository {
  pickRandom(
    categoryId: string,
    difficulty: Difficulty,
    count: number,
    excludingIds: readonly string[],
  ): Promise<Question[]>;
  byIds(ids: string[]): Promise<Question[]>;
}

export interface CategoryRepository {
  all(): Promise<Category[]>;
}
