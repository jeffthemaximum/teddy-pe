import type { Storage } from "./services/storage";
import type { Logger } from "./services/logger";

export interface CoreDeps {
  baseUrl: string;
  storage: Storage;
  logger?: Logger;
  // The API sleeps. A cold Fly machine with a suspended Neon branch measured
  // 6.6 to 7.6 seconds, so anything under 15 fails a request that was working.
  timeoutMs?: number;
}

export interface CoreConfig {
  baseUrl: string;
  storage: Storage;
  logger: Logger;
  timeoutMs: number;
}
