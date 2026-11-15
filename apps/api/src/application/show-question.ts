import { DomainError, type MatchRepository, type QuestionRepository } from "../domain";
import type { Transaction } from "./transaction";

/** A question as shown before answering: the correct option is not revealed. */
export interface QuestionView {
  id: string;
  text: string;
  timeLimitMs: number;
  /** Time left to answer, measured on the server from when the question was first shown. */
  remainingMs: number;
  options: { id: string; text: string }[];
}

export class ShowQuestion {
  constructor(
    private readonly matches: MatchRepository,
    private readonly questions: QuestionRepository,
    private readonly transaction: Transaction,
    private readonly now: () => Date,
  ) {}

  execute(matchId: string, playerId: string): Promise<QuestionView> {
    return this.transaction.run(async () => {
      const match = await this.matches.byId(matchId);
      if (!match) throw new DomainError("NOT_FOUND", "Match not found");
      const now = this.now();
      const shown = match.showQuestion(playerId, now);
      await this.matches.save(match);

      const [question] = await this.questions.byIds([shown.questionId]);
      if (!question) throw new DomainError("NOT_FOUND", "Question not found");
      return {
        id: question.id,
        text: question.text,
        timeLimitMs: question.timeLimitMs,
        remainingMs: question.remainingMs(shown.shownAt, now),
        options: question.options.map(({ id, text }) => ({ id, text })),
      };
    });
  }
}
