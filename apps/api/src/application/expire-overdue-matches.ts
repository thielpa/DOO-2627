import { type MatchRepository, OverdueMatch } from "../domain";
import type { EventDispatcher } from "./event-dispatcher";
import type { Transaction } from "./transaction";

export class ExpireOverdueMatches {
  constructor(
    private readonly matches: MatchRepository,
    private readonly transaction: Transaction,
    private readonly events: EventDispatcher,
    private readonly now: () => Date,
  ) {}

  async execute(): Promise<number> {
    // All overdue ids, so matches that keep failing cannot crowd out the others.
    const ids = await this.matches.findIdsSatisfying(new OverdueMatch(this.now()));
    const errors: unknown[] = [];
    let expiredCount = 0;

    // One transaction per match, so a failing match does not keep the others from expiring.
    for (const id of ids) {
      try {
        const hasExpired = await this.transaction.run(async () => {
          // Locked, so a player cannot move while it expires.
          const match = await this.matches.byIdForUpdate(id);
          // Checked again with the current time: a player may have moved in the meantime.
          if (!match?.expireIfOverdue(this.now())) return false;
          await this.matches.save(match);
          await this.events.dispatch(match.pullEvents());
          return true;
        });
        if (hasExpired) expiredCount++;
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} overdue match(es) could not be expired`);
    }
    return expiredCount;
  }
}
