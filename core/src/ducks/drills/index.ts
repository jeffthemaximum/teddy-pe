import type { FetchState } from "../../lib/createFetchDuck";
import { createFetchDuck } from "../../lib/createFetchDuck";
import type { Drill } from "../../types";

// The drill glossary: one flat list, searched rather than paged, because
// Teddy and Jeff both look things up by name mid-session.
export const drills = createFetchDuck<{ drills: Drill[] }, void>({
  name: "drills",
  path: () => "/api/v1/drills",
});

interface WithDrills {
  drills: FetchState<{ drills: Drill[] }>;
}

export const selectDrills = (s: WithDrills): Drill[] => s.drills.data?.drills ?? [];

export const selectDrillBySlug =
  (slug: string) =>
  (s: WithDrills): Drill | null =>
    selectDrills(s).find((d) => d.slug === slug) ?? null;

// Teddy types what he calls the drill, not what the sheet calls it. Aliases
// exist for exactly that, so searching them is not a nicety.
export const selectDrillsMatching =
  (query: string) =>
  (s: WithDrills): Drill[] => {
    const all = selectDrills(s);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.slug.includes(q) ||
        d.aliases.some((a) => a.toLowerCase().includes(q)),
    );
  };
