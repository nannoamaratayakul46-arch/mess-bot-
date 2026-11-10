"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { patchSource } = require("../scripts/ws3-fca-error-patch");

test("ws3-fca HTTP parser preserves status and a redacted response summary", () => {
  const source = `
function makeParsable(body) { return body; }
function parseAndCheckLogin(ctx, http, retryCount) {
  if (retryCount >= 5) {
    const err = new Error("Request retry failed.");
    err.statusCode = data.statusCode;
    err.res = data.body;
    err.error = "Request retry failed.";
    throw err;
  }
  if (data.statusCode === 404) return;
  if (data.statusCode !== 200)
    throw new Error("parseAndCheckLogin got status code: " + data.statusCode + ".");
}
`;
  const patched = patchSource(source);
  assert.match(patched, /ECLIPSE_WS3_HTTP_DIAGNOSTICS_V1/);
  assert.match(patched, /WS3_HTTP_RETRY_EXHAUSTED/);
  assert.match(patched, /WS3_HTTP_404/);
  assert.match(patched, /WS3_HTTP_STATUS/);
  assert.match(patched, /responseSummary = eclipseResponseSummary\(data\)/);
  assert.doesNotMatch(patched, /data\.statusCode === 404\) return/);
  assert.equal(patchSource(patched), patched, "patch must be idempotent");
});

test("ws3-fca send payload guard remains idempotent", () => {
  const source = "const messageInfo = resData.payload.actions.reduce((acc, row) => acc, null);";
  const patched = patchSource(source);
  assert.match(patched, /Messenger send response missing payload\.actions/);
  assert.equal(patchSource(patched), patched);
});
