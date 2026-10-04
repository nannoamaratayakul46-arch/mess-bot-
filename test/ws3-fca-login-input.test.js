const fs = require("fs");
const assert = require("assert");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.strictEqual(
  pkg.dependencies["ws3-fca"],
  "3.5.2",
  "Facebook credential login requires the ws3-fca release that supports email/password credentials."
);

const source = fs.readFileSync("index.js", "utf8");
assert.match(source, /dashboardFacebookCredentials/);
assert.match(source, /preferDashboardCredentials/);
assert.match(source, /login\(\s*loginInput/);

console.log("ws3-fca dashboard credential compatibility checks passed");
