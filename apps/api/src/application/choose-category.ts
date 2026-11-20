import {
  DomainError,
  type MatchRepository,
  QUESTIONS_PER_ROUND,
  type QuestionRepository,
} from "../domain";
import type { Transaction } from "./transaction";

export class ChooseCategory {
  constructor(
    private readonly matches: MatchRepository,
    private readonly questions: QuestionRepository,
    private readonly transaction: Transaction,
    private readonly now: () => Date,
  ) {}

  execute(matchId: string, playerId: string, categoryId: string): Promise<void> {
    return this.transaction.run(async () => {
      const match = await this.matches.byIdForUpdate(matchId);
      if (!match) throw new DomainError("NOT_FOUND", "Match not found");
      const now = this.now();
      // Reject players who may not choose before querying the catalog.
      match.assertCanChooseCategory(playerId, now);

      const questions = await this.questions.pickRandom(
        categoryId,
        match.difficulty,
        QUESTIONS_PER_ROUND,
        match.usedQuestionIds(),
      );
      if (questions.length < QUESTIONS_PER_ROUND) {
        throw new DomainError("NOT_FOUND", "Not enough questions in this category");
      }

      match.chooseCategory(
        playerId,
        categoryId,
        questions.map((q) => q.id),
        now,
      );
      await this.matches.save(match);
    });
  }
}
