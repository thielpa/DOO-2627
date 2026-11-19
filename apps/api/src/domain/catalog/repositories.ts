import type { Category } from "./category";
import type { Difficulty } from "./difficulty";
import type { Question } from "./question";

export interface QuestionRepository {
  // TODO(specification): the rule "question fits the round: category, difficulty, not used yet in
  // the match" is written in MikroOrmQuestionRepository.pickRandom and
  // InMemoryQuestionRepository.pickRandom. Match.chooseCategory does not check category and
  // difficulty at all. Extract it like OverdueMatch (docs/design.md, section 6.1).
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
