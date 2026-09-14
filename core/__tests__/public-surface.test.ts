import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import * as core from "../src";

// The brief's own version of this test (task-9-brief.md) only checks that
// each name in a list `toHaveProperty` on the module. That assertion is a
// one-way subset check: it passes just as happily if `index.ts` exports
// fifty extra things nobody decided to expose, because `toHaveProperty`
// never looks at what else is there. This project has already found
// twenty-two assertions that passed while checking nothing; this file does
// not add a twenty-third.
//
// So this asserts the surface as a SET, both directions: every name below
// must be exported, and nothing else may be. Removing a name the apps need,
// or adding one nobody decided to expose, fails a test here.
//
// Values and types are asserted separately, on purpose, because they are
// different things to both a bundler and to this test:
//
// - Value exports (functions, objects, action creators) exist at runtime.
//   `import * as core from "../src"` gives a real object, and
//   `Object.keys(core)` lists exactly its own properties — type-only
//   exports never appear there, because `export type` is erased by the
//   compiler and leaves nothing behind to be a property of anything. So
//   `Object.keys` is already an exact, two-way check for values, with no
//   extra machinery: it can't under-count (every value export is a real
//   property) and it can't over-count (nothing else becomes one).
//
// - Type exports leave no trace at runtime, which is exactly why a test
//   that only imports the module and pokes at it with `toHaveProperty`
//   cannot see them at all — the weakest possible treatment of a type
//   export is silence, and silence still passes. Catching a missing type
//   export at least breaks the build (a component that imported `Drill`
//   stops compiling), but catching an ACCIDENTAL type export needs
//   something that can see the source the way the compiler does. So this
//   file parses core/src/index.ts with the TypeScript compiler's own
//   parser and reads back exactly which top-level names it exports as
//   types versus values, the same distinction `tsc` itself would draw, and
//   compares that against the same two expected sets.
const INDEX_PATH = path.join(__dirname, "..", "src", "index.ts");

interface ExportNames {
  values: string[];
  types: string[];
  hasDefaultExport: boolean;
}

function exportedNamesOf(filePath: string): ExportNames {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const values = new Set<string>();
  const types = new Set<string>();
  let hasDefaultExport = false;

  function record(name: string, isType: boolean) {
    if (isType) {
      types.add(name);
    } else {
      values.add(name);
    }
  }

  for (const statement of sourceFile.statements) {
    // `export { a, b as c }` and `export type { a, b } from "./x"`, with or
    // without a `from` clause. Each specifier can also carry its own
    // `type` modifier (`export { type Foo, bar }`), which wins over the
    // declaration-level modifier for that one specifier.
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const spec of statement.exportClause.elements) {
          const exportedName = spec.name.text;
          const isType = statement.isTypeOnly || spec.isTypeOnly;
          record(exportedName, isType);
        }
      } else {
        // `export * from "./module"` (no exportClause at all) or
        // `export * as ns from "./module"` (a NamespaceExport clause)
        // re-exports a set of names this parser cannot see one at a time —
        // it would have to open "./module" too, and whatever it re-exports
        // from, and so on, which is a bundler's job, not this test's. Refuse
        // the construct outright rather than silently walk past it: every
        // name on this surface is meant to be a deliberate decision, and a
        // wildcard is the one export form that cannot name what it exposes.
        throw new Error(
          `core/src/index.ts contains "${statement.getText(sourceFile)}", a wildcard re-export this ` +
            "exact-set test cannot verify by name. The public surface must name every export " +
            "explicitly (export { a, b } / export type { A, B }), not re-export a module's entire " +
            "namespace.",
        );
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      hasDefaultExport = true;
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (!isExported) continue;

    const isDefault = modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    if (isDefault) {
      hasDefaultExport = true;
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) values.add(decl.name.text);
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      values.add(statement.name.text);
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      values.add(statement.name.text);
    } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      types.add(statement.name.text);
    }
  }

  return {
    values: [...values].sort(),
    types: [...types].sort(),
    hasDefaultExport,
  };
}

// The exact value surface. Every name here is something an app dispatches,
// selects with, or boots the store with. Nothing here is saga-internal, a
// test accessor (storedConfig never appears), or a name the apps have no
// business reaching.
const EXPECTED_VALUES = [
  "createCoreStore",
  "memoryStorage",
  "authActions",
  "authSelectors",
  "outboxActions",
  "outboxSelectors",
  "journalActions",
  "journalSelectors",
  "testResultsActions",
  "testResultsSelectors",
  "programYears",
  "programYear",
  "plan",
  "week",
  "selectWeek",
  "selectDayByDate",
  "selectWeekBudget",
  "selectWeekSpend",
  "drills",
  "selectDrills",
  "selectDrillBySlug",
  "selectDrillsMatching",
  "progression",
  "useAppSelector",
  "useAppDispatch",
].sort();

// The exact type surface. `ApiError`, `ApiRequest` and `HttpMethod` are
// deliberately absent: nothing on this surface has to describe a request
// shape, and by the time an error reaches state it is already the plain
// string every error selector above returns (selectAuthError,
// selectJournalError, selectTestResultsError, and each read duck's own
// selectError) — an app renders that string and never touches an ApiError
// instance. `storedConfig` never appears here either; it is a test
// accessor for configureStore.ts's own suite, not part of this surface.
const EXPECTED_TYPES = [
  "Storage",
  "Logger",
  "CoreDeps",
  "RootState",
  "AuthState",
  "User",
  "Role",
  "LoginResponse",
  "Athlete",
  "OutboxState",
  "QueueableAction",
  "QueuedWrite",
  "JournalState",
  "SaveAthleteEntryPayload",
  "SaveCoachEntryPayload",
  "CoachEntry",
  "AthleteEntry",
  "DrillRatingValue",
  "TestResultsState",
  "SaveResultPayload",
  "TestResult",
  "TestDate",
  "ProgramYearSummary",
  "ProgramYearDetail",
  "MonthPlan",
  "WeekPayload",
  "DayCard",
  "DayBlock",
  "Token",
  "Drill",
  "ProgressionPayload",
  "AppDispatch",
].sort();

describe("the public surface", () => {
  const parsed = exportedNamesOf(INDEX_PATH);

  it("exports exactly the values both apps need: no more, no less", () => {
    expect(parsed.values).toEqual(EXPECTED_VALUES);
  });

  it("exports exactly the types both apps need: no more, no less", () => {
    expect(parsed.types).toEqual(EXPECTED_TYPES);
  });

  it("matches at runtime too: every expected value is a real property, and nothing else is", () => {
    // Belt and suspenders against the source-parsing check above: this is
    // the same exact-set assertion, but against the compiled module object
    // rather than its source text. `Object.keys` on a namespace import
    // only ever lists value exports, since a type export is erased by the
    // compiler and leaves no property behind — which is exactly why this
    // check alone could never catch an accidental TYPE export, and why the
    // parse-based check above exists.
    expect(Object.keys(core).sort()).toEqual(EXPECTED_VALUES);
  });

  it("exports no default, so imports stay explicit and greppable", () => {
    expect(parsed.hasDefaultExport).toBe(false);
    expect((core as { default?: unknown }).default).toBeUndefined();
  });
});
