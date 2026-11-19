import type { DomainEvent } from "../domain";

export interface EventDispatcher {
  dispatch(events: readonly DomainEvent[]): Promise<void>;
}
