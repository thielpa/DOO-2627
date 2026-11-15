import { type EntityManager, raw } from "@mikro-orm/postgresql";
import { type Difficulty, Question, type QuestionRepository } from "../../../domain";

export class MikroOrmQuestionRepository implements QuestionRepository {
  constructor(private readonly em: EntityManager) {}

  pickRandom(
    categoryId: string,
    difficulty: Difficulty,
    count: number,
    excludingIds: readonly string[],
  ): Promise<Question[]> {
    return this.em.find(
      Question,
      {
        categoryId,
        difficulty,
        ...(excludingIds.length > 0 && { id: { $nin: [...excludingIds] } }),
      },
      { orderBy: { [raw("random()")]: "asc" }, limit: count },
    );
  }

  byIds(ids: string[]): Promise<Question[]> {
    return this.em.find(Question, { id: { $in: ids } });
  }
}
