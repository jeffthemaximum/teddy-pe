import { createFetchDuck } from "../../lib/createFetchDuck";
import type { Progression } from "../../types";

// The cross-year view: years, ranks, the fitness battery and height over
// time, drills. ranks, battery and drills stay unknown[] because production
// has no awards or results yet; nobody here invents a shape nobody has seen.
export const progression = createFetchDuck<Progression, void>({
  name: "progression",
  path: () => "/api/v1/progression",
});
