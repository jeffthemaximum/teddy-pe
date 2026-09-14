import { Navigate, Route, Routes } from "react-router-dom";
import type { Role } from "@teddy-pe/core";
import { Year } from "./screens/Year";
import { Month } from "./screens/Month";
import { ThisWeek } from "./screens/ThisWeek";
import { Glossary } from "./screens/Glossary";

// A screen a person can tap that always answers 403 is worse than no screen
// at all: it teaches them the app is broken. This table is not a guess, it
// is the production access rules as verified against the deployed API in
// Phase 1:
//
//   endpoint                                          coach  athlete  viewer
//   /api/v1/athlete_entries        (the Journal)        200    200     403
//   /api/v1/coach_entries          (the Notes)           200    403     403
//   /api/v1/test_results           (Tests)                200    200     200
//   program_years, plans, weeks,
//   drills, progression                                 200    200     200
//
// so the nav below shows exactly, and only, what the API will actually
// answer for the signed-in person.
//
// "any" means every signed-in person, including a role string this app has
// never seen. That is a real possibility, not a hypothetical: the API sends
// role as a plain string in the JWT payload, TypeScript's Role type does not
// check it at runtime, and a role this app does not recognize is either a
// bug in the API or a new account type somebody added. The four "any" items
// below are exactly the ones that answer 200 for all three known roles, so
// there is no reason to believe a role we cannot name would be refused
// either; showing the read-only program is more useful than showing nothing
// and it costs nothing if we are wrong, because the API is still the one
// deciding what each request actually returns. Journal and Notes are the
// opposite: closed by default, open only to the roles named explicitly,
// which is the direction a guess should fail in when the guess might be
// wrong (403 is what a stranger swiping this tab would get, so hiding the
// tab is never worse than what already happens if it is tapped).
export type RoleTier = Role[] | "any";

export interface NavItem {
  to: string;
  label: string;
  roles: RoleTier;
  element: JSX.Element;
}

// Phase 2c adds the journal forms and the test sheet in their place. Task 4
// already replaced /year with the real screen, Task 5 replaced /month,
// Task 6 replaced /week, and Task 7 replaced /glossary.
function Placeholder({ title }: { title: string }) {
  return <p className="placeholder">{title} is coming soon.</p>;
}

// The one table the nav and every route both read. A nav item's visibility
// and its route's guard used to be two hand-copied roles lists that could
// only agree by nobody changing one without the other; this is the fix,
// verified below by the same experiment applied to the guard: change a
// role here and watch a nav test and a route test fail together, not one
// at a time.
export const NAV_ITEMS: NavItem[] = [
  { to: "/year", label: "Year", roles: "any", element: <Year /> },
  { to: "/month", label: "Month", roles: "any", element: <Month /> },
  { to: "/week", label: "This Week", roles: "any", element: <ThisWeek /> },
  { to: "/glossary", label: "Glossary", roles: "any", element: <Glossary /> },
  { to: "/progress", label: "Progress", roles: "any", element: <Placeholder title="Progress" /> },
  { to: "/tests", label: "Tests", roles: "any", element: <Placeholder title="Tests" /> },
  // athlete_entries: closed to a viewer, open to Teddy and Jeff.
  { to: "/journal", label: "Journal", roles: ["coach", "athlete"], element: <Placeholder title="Journal" /> },
  // coach_entries: Jeff's own notes, closed to everyone else.
  { to: "/notes", label: "Notes", roles: ["coach"], element: <Placeholder title="Notes" /> },
];

function isAllowed(roles: RoleTier, role: Role | null): boolean {
  if (!role) return false;
  return roles === "any" || roles.includes(role);
}

export function navItemsFor(role: Role | null): NavItem[] {
  return NAV_ITEMS.filter((item) => isAllowed(item.roles, role));
}

// A direct URL is the one way the nav's own filtering can be bypassed, so
// every route checks the exact same table entry the nav item came from
// (item.roles, through the same isAllowed the nav used), never a second,
// hand-written roles list of its own. Landing here sends a person back to
// the one screen every role, known or not, can read, rather than at a
// screen that will answer 403 or a screen that no longer exists.
function Guarded({ item, role }: { item: NavItem; role: Role | null }) {
  if (!isAllowed(item.roles, role)) {
    return <Navigate to="/year" replace />;
  }
  return item.element;
}

export function AppRoutes({ role }: { role: Role | null }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/year" replace />} />
      {NAV_ITEMS.map((item) => (
        <Route key={item.to} path={item.to} element={<Guarded item={item} role={role} />} />
      ))}
      <Route path="*" element={<Navigate to="/year" replace />} />
    </Routes>
  );
}
