import { combineReducers } from "@reduxjs/toolkit";
import { reducer as auth } from "../ducks/auth";

export const rootReducer = combineReducers({ auth });
export type RootState = ReturnType<typeof rootReducer>;
