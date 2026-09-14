import { Navigate, Route, Routes } from "react-router-dom";
import type { Role } from "@teddy-pe/core";

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
export interface NavItem {
  to: string;
  label: string;
  roles: Role[];
}

const ALL_ROLES: Role[] = ["coach", "athlete", "viewer"];

export const NAV_ITEMS: NavItem[] = [
  { to: "/year", label: "Year", roles: ALL_ROLES },
  { to: "/month", label: "Month", roles: ALL_ROLES },
  { to: "/week", label: "This Week", roles: ALL_ROLES },
  { to: "/glossary", label: "Glossary", roles: ALL_ROLES },
  { to: "/progress", label: "Progress", roles: ALL_ROLES },
  { to: "/tests", label: "Tests", roles: ALL_ROLES },
  // athlete_entries: closed to a viewer, open to Teddy and Jeff.
  { to: "/journal", label: "Journal", roles: ["coach", "athlete"] },
  // coach_entries: Jeff's own notes, closed to everyone else.
  { to: "/notes", label: "Notes", roles: ["coach"] },
];

export function navItemsFor(role: Role | null): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

// Later tasks (4 through 7) replace these placeholders with the real Year,
// Month, This Week and Glossary screens, and Phase 2c adds the journal
// forms and the test sheet. This task's job is the shell around them: the
// nav, the routes, and who is allowed where.
function Placeholder({ title }: { title: string }) {
  return (
    <p className="placeholder">
      {title} is coming soon.
    </p>
  );
}

// A direct URL is the one way the nav's own filtering can be bypassed, so
// each protected route checks the same roles list the nav item used, not
// just the nav item's visibility. Landing here sends a person back to the
// one screen every role can read rather than at a screen that will 403.
function Allowed({ roles, role, children }: { roles: Role[]; role: Role | null; children: JSX.Element }) {
  if (!role || !roles.includes(role)) {
    return <Navigate to="/year" replace />;
  }
  return children;
}

export function AppRoutes({ role }: { role: Role | null }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/year" replace />} />
      <Route path="/year" element={<Placeholder title="Year" />} />
      <Route path="/month" element={<Placeholder title="Month" />} />
      <Route path="/week" element={<Placeholder title="This Week" />} />
      <Route path="/glossary" element={<Placeholder title="Glossary" />} />
      <Route path="/progress" element={<Placeholder title="Progress" />} />
      <Route path="/tests" element={<Placeholder title="Tests" />} />
      <Route
        path="/journal"
        element={
          <Allowed roles={["coach", "athlete"]} role={role}>
            <Placeholder title="Journal" />
          </Allowed>
        }
      />
      <Route
        path="/notes"
        element={
          <Allowed roles={["coach"]} role={role}>
            <Placeholder title="Notes" />
          </Allowed>
        }
      />
      <Route path="*" element={<Navigate to="/year" replace />} />
    </Routes>
  );
}
