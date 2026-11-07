export class PlayerAnswer {
  constructor(
    readonly playerId: string,
    readonly questionId: string,
    /** `null` when the time ran out without an answer. */
    readonly optionId: string | null,
    readonly timeNeededMs: number,
    readonly isCorrect: boolean,
  ) {}
}
