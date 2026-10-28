// The sim has no DOM or Node types (it must stay platform-free), but tests
// may print balance tables.
declare const console: {
  log(...data: unknown[]): void;
  table(data: unknown): void;
};
