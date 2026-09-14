import { Navigate, Route, Routes } from "react-router-dom";
import type { Role } from "@teddy-pe/core";
import { Today } from "./screens/Today";
import { Year } from "./screens/Year";
import { Month } from "./screens/Month";
import { ThisWeek } from "./screens/ThisWeek";
import { Glossary } from "./screens/Glossary";
import { AthleteJournal } from "./screens/AthleteJournal";
import { CoachJournal } from "./screens/CoachJournal";
import { Progress } from "./screens/Progress";
import { Tests } from "./screens/Tests";

// A screen a person can tap that always answers 403 is worse than no screen
// at all: it teaches them the app is broken. This table is not a guess, it
// is the production access rules as verified against the deployed API in
// Phase 1:
//
//   endpoint                                          coach  athlete  viewer
//   /api/v1/athlete_entries  index (the Journal)         200    200     403
//   /api/v1/coach_entries    index (the Notes)            200    403     403
//   /api/v1/test_results     create (the only thing       200    200     403
//                            the Tests screen offers)
//   program_years, plans, weeks,
//   drills, progression                                 200    200     200
//
// so the nav below shows exactly, and only, what the API will actually
// answer for the signed-in person.
//
// Tests is read on /api/v1/test_results#index (200 for all three) but the
// screen itself is nothing but live input boxes, so it is gated on
// test_results#create, the action every one of those boxes actually takes.
// A viewer who could technically fetch the results has no way to use this
// screen for anything that will not 403 the moment she blurs a box.
//
// "any" means every signed-in person, including a role string this app has
// never seen. That is a real possibility, not a hypothetical: the API sends
// role as a plain string in the JWT payload, TypeScript's Role type does not
// check it at runtime, and a role this app does not recognize is either a
// bug in the API or a new account type somebody added. The "any" items
// below are exactly the ones that answer 200 for all three known roles, so
// there is no reason to believe a role we cannot name would be refused
// either; showing the read-only program is more useful than showing nothing
// and it costs nothing if we are wrong, because the API is still the one
// deciding what each request actually returns. Journal, Notes and Tests are
// the opposite: closed by default, open only to the roles named explicitly,
// which is the direction a guess should fail in when the guess might be
// wrong (403 is what a stranger swiping this tab would get, so hiding the
// tab is never worse than what already happens if it is tapped).
// Where a person lands: signing in, hitting "/", and being turned away from
// a route their role may not read. It was "/year" until Today existed; both
// are "any" routes, so this is the same guarantee, pointed at the screen he
// actually opens mid-session instead of the one that used to be first. One
// constant, used everywhere below that means "home", the nav item's own
// `to` included: a route table entry that spelled "/today" out a second
// time instead of reading HOME could drift from it, and a drift here is
// not cosmetic, it is a redirect loop (`*` sends you to whatever HOME says,
// and if that string matches no route in this table, there is nowhere for
// the browser to land).
export const HOME = "/today";

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
  // First, so it is what a person taps back to and, per HOME above, what
  // signing in and a stray URL both land on. Every role gets it: the day
  // card, the note under it and the test sheet each gate themselves to
  // what that role's own screen shows (Today.tsx), the same way this table
  // already trusts Year, Month, This Week, Glossary and Progress to.
  { to: HOME, label: "Today", roles: "any", element: <Today /> },
  { to: "/year", label: "Year", roles: "any", element: <Year /> },
  { to: "/month", label: "Month", roles: "any", element: <Month /> },
  { to: "/week", label: "This Week", roles: "any", element: <ThisWeek /> },
  { to: "/glossary", label: "Glossary", roles: "any", element: <Glossary /> },
  { to: "/progress", label: "Progress", roles: "any", element: <Progress /> },
  // test_results create: coach or athlete only. A viewer's fifteen input
  // boxes would 403 on every one of them, so she does not get the tab.
  { to: "/tests", label: "Tests", roles: ["coach", "athlete"], element: <Tests /> },
  // athlete_entries index: closed to a viewer, open to Teddy and Jeff. Jeff
  // reads this screen, he does not write on it; athlete_entries#create is
  // athlete-only, so Save and the share toggle answer only to Teddy. That
  // is a rule the screen itself has to keep (AthleteJournal renders the
  // controls only for the role that can use them), not a reason to hide the
  // route from Jeff: he can read the page the API hands him, every time.
  { to: "/journal", label: "Journal", roles: ["coach", "athlete"], element: <AthleteJournal /> },
  // coach_entries: Jeff's own notes, closed to everyone else.
  { to: "/notes", label: "Notes", roles: ["coach"], element: <CoachJournal /> },
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
    return <Navigate to={HOME} replace />;
  }
  return item.element;
}

// The one drill token in a day card carries a slug, and tapping it needs to
// land here already open at that drill. `/glossary/:slug` reuses the exact
// NAV_ITEMS entry the plain `/glossary` route does (same element, same
// roles guard) rather than restating either: a param does not change who
// is allowed to read the glossary, so it does not get a second roles list
// of its own to drift from the first.
const GLOSSARY_ITEM = NAV_ITEMS.find((item) => item.to === "/glossary")!;

export function AppRoutes({ role }: { role: Role | null }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={HOME} replace />} />
      {NAV_ITEMS.map((item) => (
        <Route key={item.to} path={item.to} element={<Guarded item={item} role={role} />} />
      ))}
      <Route path="/glossary/:slug" element={<Guarded item={GLOSSARY_ITEM} role={role} />} />
      <Route path="*" element={<Navigate to={HOME} replace />} />
    </Routes>
  );
}
