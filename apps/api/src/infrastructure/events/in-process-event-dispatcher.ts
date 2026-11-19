import type { EventDispatcher } from "../../application";
import type { DomainEvent } from "../../domain";

export type DomainEventHandler<E extends DomainEvent> = (event: E) => void | Promise<void>;

export class InProcessEventDispatcher<E extends DomainEvent> implements EventDispatcher {
  private readonly handlers = new Map<string, DomainEventHandler<E>[]>();

  subscribe<T extends E["type"]>(
    type: T,
    handler: DomainEventHandler<Extract<E, { type: T }>>,
  ): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler as DomainEventHandler<E>);
    this.handlers.set(type, handlers);
  }

  async dispatch(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const handler of this.handlers.get(event.type) ?? []) {
        await handler(event as E);
      }
    }
  }
}
