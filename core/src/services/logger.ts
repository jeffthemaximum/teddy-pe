export interface Logger {
  info(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

// Silent by default. A package that prints during someone else's test run is
// a package people stop trusting.
export const silentLogger: Logger = {
  info() {},
  error() {},
};
