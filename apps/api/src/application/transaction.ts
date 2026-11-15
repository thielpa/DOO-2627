/** Runs a unit of work atomically. Implemented by the persistence adapter. */
export interface Transaction {
  run<T>(work: () => Promise<T>): Promise<T>;
}
