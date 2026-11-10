"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { patchSource } = require("../scripts/ws3-fca-error-patch");

// Mirrors the parser layout shipped in ws3-fca@2.0.1 package-root utils.js.
const ws3ParserFixture = `
function makeParsable(body) { return body; }
function parseAndCheckLogin(ctx, http, retryCount) {
  var delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  var _try = tryData => new Promise((resolve, reject) => {
    try { resolve(tryData()); } catch (error) { reject(error); }
  });
  if (retryCount == undefined) retryCount = 0;
  return function(data) {
    function any() {
      if (data.statusCode >= 500 && data.statusCode < 600) {
        if (retryCount >= 5) {
          const err = new Error("Request retry failed. Check the \`res\` and \`statusCode\` property on this error.");
          err.statusCode = data.statusCode;
          err.res = data.body;
          err.error = "Request retry failed. Check the response and statusCode.";
          throw err;
        }
        retryCount++;
        return delay(0)
          .then(function() { return http.post("https://www.facebook.com/messaging/send/", ctx.jar, data.request.formData); })
          .then(parseAndCheckLogin(ctx, http, retryCount));
      }
      if (data.statusCode === 404) return;
      if (data.statusCode !== 200)
        throw new Error("parseAndCheckLogin got status code: " + data.statusCode + ". Bailing out of trying to parse response.");
      return JSON.parse(makeParsable(data.body));
    }
    return _try(any);
  };
}
`;

test("ws3-fca 2.0.1 package-root parser preserves exhausted HTTP failure details", async () => {
  const patched = patchSource(ws3ParserFixture);
  assert.match(patched, /ECLIPSE_WS3_HTTP_DIAGNOSTICS_V3/);
  assert.match(patched, /WS3_HTTP_RETRY_EXHAUSTED/);
  assert.match(patched, /responseSummary = eclipseResponseSummary\(data\)/);
  assert.match(patched, /data\.statusCode === 404\) throw eclipseHttpError/);
  assert.match(patched, /data\.statusCode !== 200\) throw eclipseHttpError/);
  assert.equal(patchSource(patched), patched, "patch must be idempotent");

  const sandbox = { module: { exports: {} }, setTimeout };
  vm.runInNewContext(patched + "\nmodule.exports = parseAndCheckLogin;", sandbox);
  const parseAndCheckLogin = sandbox.module.exports;
  const response = {
    statusCode: 500,
    body: JSON.stringify({ error: "temporary upstream failure" }),
    request: { uri: { protocol: "https:", hostname: "www.facebook.com", pathname: "/messaging/send/" },
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, formData: {} },
    headers: { "content-type": "text/html; charset=utf-8" },
  };
  await assert.rejects(
    parseAndCheckLogin({ jar: {} }, { post: async () => response }, 5)(response),
    error => {
      assert.equal(error.code, "WS3_HTTP_RETRY_EXHAUSTED");
      assert.equal(error.statusCode, 500);
      const summary = JSON.parse(error.responseSummary);
      assert.equal(summary.statusCode, 500);
      assert.equal(summary.error, "temporary upstream failure");
      assert.equal(summary.requestMethod, "POST");
      assert.equal(summary.requestHost, "www.facebook.com");
      assert.equal(summary.requestPath, "/messaging/send/");
      assert.equal(summary.responseContentType, "text/html");
      return true;
    }
  );
});

test("ws3-fca non-200 response is not silently returned as an empty result", async () => {
  const patched = patchSource(ws3ParserFixture);
  const sandbox = { module: { exports: {} }, setTimeout };
  vm.runInNewContext(patched + "\nmodule.exports = parseAndCheckLogin;", sandbox);
  await assert.rejects(
    sandbox.module.exports({ jar: {} }, {}, 0)({ statusCode: 404, body: "<html>Not found</html>", headers: { "content-type": "text/html" }, request: { method: "POST", uri: { hostname: "www.facebook.com", pathname: "/messaging/send/" } } }),
    error => {
      assert.equal(error.code, "WS3_HTTP_404");
      assert.equal(error.statusCode, 404);
      const summary = JSON.parse(error.responseSummary);
      assert.equal(summary.bodyFormat, "html");
      assert.equal(summary.requestPath, "/messaging/send/");
      return true;
    }
  );
});


test("ws3-fca HTML response snippet is bounded and sanitized", async () => {
  const patched = patchSource(ws3ParserFixture);
  const sandbox = { module: { exports: {} }, setTimeout };
  vm.runInNewContext(patched + "\nmodule.exports = parseAndCheckLogin;", sandbox);
  const body = '<!doctype html><html><head><title>Facebook error</title><script>secret-token</script></head><body><h1>Not found</h1><p>https://example.com/private?token=abc</p></body></html>';
  await assert.rejects(
    sandbox.module.exports({ jar: {} }, {}, 0)({
      statusCode: 404, body,
      headers: { "content-type": "text/html; charset=utf-8" },
      request: { method: "POST", uri: { hostname: "www.facebook.com", pathname: "/messaging/send/" } }
    }),
    error => {
      const summary = JSON.parse(error.responseSummary);
      assert.equal(summary.bodyFormat, "html");
      assert.ok(summary.bodySnippet.length <= 120);
      assert.match(summary.bodySnippet, /Facebook error/);
      assert.match(summary.bodySnippet, /Not found/);
      assert.doesNotMatch(summary.bodySnippet, /secret-token|example\.com|abc/);
      return true;
    }
  );
});

test("ws3-fca send payload guard remains idempotent", () => {
  const source = "const messageInfo = resData.payload.actions.reduce((acc, row) => acc, null);";
  const patched = patchSource(source);
  assert.match(patched, /Messenger send response missing payload\.actions/);
  assert.equal(patchSource(patched), patched);
});

test("ws3-fca cached V1 diagnostics are upgraded without duplicate stale helpers", () => {
  const legacy = `
function parseAndCheckLogin(ctx, http, retryCount) {
  // ECLIPSE_WS3_HTTP_DIAGNOSTICS_V1
  function eclipseResponseSummary(data) {
    return JSON.stringify({ statusCode: Number(data && data.statusCode) || null, bodyLength: null });
  }
  function eclipseHttpError(data, code) {
    const error = new Error("old diagnostics");
    error.code = code;
    error.responseSummary = eclipseResponseSummary(data);
    return error;
  }
  if (data.statusCode === 404) return;
  if (data.statusCode !== 200) throw new Error("old status handling");
}
`;
  const upgraded = patchSource(legacy);
  assert.match(upgraded, /ECLIPSE_WS3_HTTP_DIAGNOSTICS_V3/);
  assert.doesNotMatch(upgraded, /ECLIPSE_WS3_HTTP_DIAGNOSTICS_V1/);
  assert.equal((upgraded.match(/function eclipseResponseSummary\(/g) || []).length, 1);
  assert.match(upgraded, /requestHost: typeof data\?\.request\?\.uri\?\.hostname/);
});
