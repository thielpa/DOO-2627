import { DomainError, type MatchRepository, type QuestionRepository } from "../domain";
import type { Transaction } from "./transaction";

export interface AnswerResult {
  isCorrect: boolean;
  correctOptionId: string;
}

export class AnswerQuestion {
  constructor(
    private readonly matches: MatchRepository,
    private readonly questions: QuestionRepository,
    private readonly transaction: Transaction,
    private readonly now: () => Date,
  ) {}

  execute(
    matchId: string,
    playerId: string,
    questionId: string,
    optionId: string | null,
  ): Promise<AnswerResult> {
    return this.transaction.run(async () => {
      const match = await this.matches.byId(matchId);
      if (!match) throw new DomainError("NOT_FOUND", "Match not found");
      const [question] = await this.questions.byIds([questionId]);
      if (!question) throw new DomainError("NOT_FOUND", "Question not found");

      // The match measures the time needed itself, so clients cannot report a faster answer.
      const answer = match.answer(playerId, question, optionId, this.now());
      await this.matches.save(match);

      return { isCorrect: answer.isCorrect, correctOptionId: question.correctOptionId() };
    });
  }
}
