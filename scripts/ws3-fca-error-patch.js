"use strict";

const CUSTOM_ERROR = /new\s+utils\.CustomError\s*\(/g;
const LEGACY_PARSE_MARKER = "ECLIPSE_WS3_HTTP_DIAGNOSTICS_V1";
const PARSE_MARKER = "ECLIPSE_WS3_HTTP_DIAGNOSTICS_V2";

function patchSource(source) {
  let updated = String(source || "").replace(CUSTOM_ERROR, "new Error(");

  // Preserve safe HTTP response metadata before ws3-fca turns it into an
  // empty result that sendMessage.js masks as "Send message failed.".
  const parseHeader = /function\s+parseAndCheckLogin\s*\(ctx,\s*http,\s*retryCount\)\s*\{/;
  if (parseHeader.test(updated) && updated.includes(LEGACY_PARSE_MARKER)) {
    // Replace the V1 helper block; otherwise its later declaration overrides V2.
    const legacyHelpers = /\n[ \t]*\/\/ ECLIPSE_WS3_HTTP_DIAGNOSTICS_V1[\s\S]*?function eclipseHttpError\(data, code\) \{[\s\S]*?\n[ \t]*\}\n/;
    updated = updated.replace(legacyHelpers, "\\n");
  }
  if (parseHeader.test(updated) && !updated.includes(PARSE_MARKER)) {
    const helpers = [
      "",
      "  // " + PARSE_MARKER,
      "  function eclipseResponseSummary(data) {",
      "    const summary = {",
      "      statusCode: Number(data && data.statusCode) || null,",
      "      bodyLength: typeof data?.body === \"string\" ? data.body.length : null,",
      "      bodyFormat: typeof data?.body !== \"string\" ? (data?.body && typeof data.body === \"object\" ? \"object\" : \"unknown\") : (/^\\s*</.test(data.body) ? \"html\" : /^\\s*[\\[{]/.test(data.body) ? \"json-or-structured\" : \"text\"),",
      "      requestMethod: typeof data?.request?.method === \"string\" ? data.request.method.slice(0, 12) : null,",
      "      requestHost: typeof data?.request?.uri?.hostname === \"string\" ? data.request.uri.hostname.slice(0, 100) : null,",
      "      requestPath: typeof data?.request?.uri?.pathname === \"string\" ? data.request.uri.pathname.replace(/[^A-Za-z0-9_./-]/g, \"\").slice(0, 160) : null,",
      "      responseContentType: typeof data?.headers?.[\"content-type\"] === \"string\" ? data.headers[\"content-type\"].split(\";\")[0].slice(0, 80) : null,",
      "    };",
      "    if (typeof data?.body === \"string\") {",
      "      try {",
      "        const parsed = JSON.parse(makeParsable(data.body));",
      "        if (parsed && typeof parsed === \"object\" && !Array.isArray(parsed)) {",
      "          const allowed = [\"error\", \"errorSummary\", \"errorDescription\", \"error_description\", \"error_user_title\", \"error_user_msg\", \"error_subcode\", \"errorCode\"];",
      "          for (const key of allowed) {",
      "            const value = parsed[key];",
      "            if (typeof value === \"string\" || typeof value === \"number\" || typeof value === \"boolean\") summary[key] = String(value).slice(0, 160);",
      "          }",
      "        }",
      "      } catch { /* Non-JSON bodies are represented by status and length only. */ }",
      "    }",
      "    return JSON.stringify(summary).slice(0, 500);",
      "  }",
      "  function eclipseHttpError(data, code) {",
      "    const statusCode = Number(data && data.statusCode) || 0;",
      "    const error = new Error(\"ws3-fca HTTP \" + statusCode + \" response while processing a Messenger request.\");",
      "    error.code = code || \"WS3_HTTP_STATUS\";",
      "    error.statusCode = statusCode;",
      "    error.responseSummary = eclipseResponseSummary(data);",
      "    return error;",
      "  }",
      ""
    ].join("\n");
    updated = updated.replace(parseHeader, match => match + helpers);
  }

  if (updated.includes(PARSE_MARKER)) {
    const retryExhausted = /if\s*\(\s*retryCount\s*>=\s*5\s*\)\s*\{([\s\S]*?)throw err;([\s\S]*?)\}/;
    updated = updated.replace(retryExhausted, block => {
      if (block.includes("eclipseResponseSummary(data)")) return block;
      return block.replace("throw err;", 'err.code = "WS3_HTTP_RETRY_EXHAUSTED";\n        err.responseSummary = eclipseResponseSummary(data);\n        throw err;');
    });
    updated = updated.replace(
      /if\s*\(\s*data\.statusCode\s*===\s*404\s*\)\s*return\s*;/,
      'if (data.statusCode === 404) throw eclipseHttpError(data, "WS3_HTTP_404");'
    );
    updated = updated.replace(
      /if\s*\(\s*data\.statusCode\s*!==\s*200\s*\)\s*throw\s+new\s+Error\([\s\S]*?\);/,
      'if (data.statusCode !== 200) throw eclipseHttpError(data, "WS3_HTTP_STATUS");'
    );
  }

  const sendResponsePattern = /(^[ \t]*)(?:const|let|var)\s+messageInfo\s*=\s*resData\.payload\.actions\.reduce\s*\(/m;
  if (/resData\.payload\.actions\.reduce\s*\(/.test(updated) &&
      !updated.includes("Messenger send response missing payload.actions") &&
      sendResponsePattern.test(updated)) {
    updated = updated.replace(sendResponsePattern, (_match, indent) =>
      indent +
      'if (!resData || !resData.payload || !Array.isArray(resData.payload.actions)) {\n' +
      indent + '  throw new Error("Messenger send response missing payload.actions (possible session, permission, or rate-limit response).");\n' +
      indent + '}\n' +
      indent + 'const messageInfo = resData.payload.actions.reduce('
    );
  }

  return updated;
}

module.exports = { patchSource };
