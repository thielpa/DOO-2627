/**
 * Something that happened in the domain. `type` names the event and `version` its contract:
 * adding a field keeps the version, renaming or removing one raises it (see docs/architecture.md).
 *
 * Event types live here, outside the publishing context, so subscribers of other contexts depend
 * only on this module and never on the publisher.
 */
export interface DomainEvent {
  /** UUID, unique per event; subscribers use it to handle an event only once. */
  readonly eventId: string;
  readonly type: string;
  readonly version: number;
  readonly occurredAt: Date;
}
