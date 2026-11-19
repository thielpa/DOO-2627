import type { ExpireOverdueMatches } from "../application/expire-overdue-matches";
import type { AroundRequest } from "../http/app";

export interface ExpiryJobDependencies {
  useCase: ExpireOverdueMatches;
  /** Gives each run its own persistence context, like a request gets. */
  aroundRequest: AroundRequest;
  intervalMs: number;
}

export function startExpiryJob({ useCase, aroundRequest, intervalMs }: ExpiryJobDependencies) {
  const timer = setInterval(async () => {
    try {
      await aroundRequest(async () => {
        const expiredCount = await useCase.execute();
        if (expiredCount > 0) console.info(`Expired ${expiredCount} overdue match(es)`);
      });
    } catch (error) {
      console.error("Expiring overdue matches failed", error);
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
