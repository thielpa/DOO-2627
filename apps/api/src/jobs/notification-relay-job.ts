import type { RelayPendingDeliveries } from "../application/notification/relay-pending-deliveries";
import type { AroundRequest } from "../http/app";

export interface NotificationRelayJobDependencies {
  useCase: RelayPendingDeliveries;
  /** Gives each cycle its own persistence context, like a request gets. */
  aroundRequest: AroundRequest;
  intervalMs: number;
}

/** Polling publisher of the transactional outbox. A cycle never overlaps with the previous one. */
export function startNotificationRelayJob({
  useCase,
  aroundRequest,
  intervalMs,
}: NotificationRelayJobDependencies) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await aroundRequest(async () => {
        await useCase.execute();
      });
    } catch (error) {
      console.error("Notification relay cycle failed", error);
    } finally {
      running = false;
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
