const fs = require("fs");
const path = require("path");
const assert = require("assert");

const source = fs.readFileSync(
  path.join(__dirname, "..", "index.js"),
  "utf8"
);

assert.match(source, /\/api\/dashboard\/connect-credentials/);
assert.match(source, /dashboardFacebookCredentials = \{\s*email,\s*password,/);
assert.match(source, /Credentials are intentionally ephemeral/);
assert.match(source, /dashboardFacebookCredentials = null/);
assert.match(source, /preferDashboardCredentials = false/);

console.log("dashboard Facebook credential login regression checks passed");
