import { all, fork } from "redux-saga/effects";
import { authSaga } from "../ducks/auth";

export function* rootSaga() {
  yield all([fork(authSaga)]);
}
