import { all, fork } from "redux-saga/effects";
import { authSaga } from "../ducks/auth";
import { outboxSaga } from "../ducks/outbox";
import { journalSaga } from "../ducks/journal";
import { testResultsSaga } from "../ducks/testResults";
import { programYears } from "../ducks/programYears";
import { programYear } from "../ducks/programYear";
import { plan } from "../ducks/plan";
import { week } from "../ducks/week";
import { drills } from "../ducks/drills";
import { progression } from "../ducks/progression";

export function* rootSaga() {
  yield all([
    fork(authSaga),
    fork(outboxSaga),
    fork(journalSaga),
    fork(testResultsSaga),
    fork(programYears.saga),
    fork(programYear.saga),
    fork(plan.saga),
    fork(week.saga),
    fork(drills.saga),
    fork(progression.saga),
  ]);
}
