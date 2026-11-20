import type { Match } from "./match";

/**
 * Specification (Evans & Fowler): a running match whose player missed the turn deadline.
 *
 * Why? So the rule is written down only here. The Match checks itself with it (`isOverdue`), the
 * in-memory repository filters with `isSatisfiedBy`, and the database repository turns the
 * criteria below into a query, so the two cannot drift apart unnoticed.
 */
export class OverdueMatch {
  /** Only running matches can be overdue. */
  readonly status = "STARTED" as const;

  /** @param now the deadline is missed once it is at or before this moment */
  constructor(readonly now: Date) {}

  isSatisfiedBy(match: Match): boolean {
    return (
      match.status === this.status &&
      match.turnDeadline !== null &&
      match.turnDeadline.getTime() <= this.now.getTime()
    );
  }
}
