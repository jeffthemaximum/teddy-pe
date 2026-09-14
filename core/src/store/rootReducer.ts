import { combineReducers } from "@reduxjs/toolkit";
import { reducer as auth } from "../ducks/auth";
import { reducer as outbox } from "../ducks/outbox";
import { reducer as journal } from "../ducks/journal";
import { reducer as testResults } from "../ducks/testResults";
import { programYears } from "../ducks/programYears";
import { programYear } from "../ducks/programYear";
import { plan } from "../ducks/plan";
import { week } from "../ducks/week";
import { drills } from "../ducks/drills";
import { progression } from "../ducks/progression";

export const rootReducer = combineReducers({
  auth,
  outbox,
  journal,
  testResults,
  programYears: programYears.reducer,
  programYear: programYear.reducer,
  plan: plan.reducer,
  week: week.reducer,
  drills: drills.reducer,
  progression: progression.reducer,
});
export type RootState = ReturnType<typeof rootReducer>;
