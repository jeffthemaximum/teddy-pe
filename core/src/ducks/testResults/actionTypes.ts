export const FETCH_RESULTS = "testResults/FETCH_RESULTS";
export const RESULTS_FETCHED = "testResults/RESULTS_FETCHED";
export const FETCH_RESULTS_FAILED = "testResults/FETCH_RESULTS_FAILED";
export const SAVE_RESULT = "testResults/SAVE_RESULT";
export const RESULT_SAVED = "testResults/RESULT_SAVED";
// Clearing a box is the same request with an empty value; the controller
// deletes the row rather than saving an empty one, and answers with a
// different shape. This is the only delete anywhere in the API.
export const RESULT_DELETED = "testResults/RESULT_DELETED";
export const SAVE_QUEUED = "testResults/SAVE_QUEUED";
export const SAVE_FAILED = "testResults/SAVE_FAILED";
