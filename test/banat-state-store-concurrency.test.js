"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

test("concurrent Banat state writers use independent atomic temporary files", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "banat-state-concurrency-"));
  const modulePath = path.join(root, "banat-state-store.js");
  fs.copyFileSync(path.join(__dirname, "..", "banat-state-store.js"), modulePath);

  try {
    const script = `
      const store = require(${JSON.stringify(modulePath)});
      for (let index = 0; index < 20; index += 1) {
        store.writeSection("worker-" + process.argv[1], { index });
      }
    `;
    const workers = Array.from({ length: 8 }, (_, worker) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["-e", script, String(worker)], { stdio: "ignore" });
      child.once("error", reject);
      child.once("exit", code => {
        if (code === 0) resolve();
        else reject(new Error("Banat state writer exited with code " + code));
      });
    }));

    await Promise.all(workers);
    const stateFile = path.join(root, "data", "banat-state.json");
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(stateFile, "utf8")));
    assert.deepEqual(
      fs.readdirSync(path.join(root, "data")).filter(name => name.endsWith(".tmp")),
      []
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
