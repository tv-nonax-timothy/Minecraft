const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readManifest = (type) => JSON.parse(fs.readFileSync(
  path.join(root, `${type}_pack`, "Nonax_Architect_Pack", "manifest.json"), "utf8"
));
const resource = readManifest("resource");
const behavior = readManifest("behavior");

for (const [source, target] of [[resource, behavior], [behavior, resource]]) {
  const dependencies = source.dependencies.filter((entry) => entry.uuid === target.header.uuid);
  assert.equal(dependencies.length, 1);
  assert.deepEqual(dependencies[0].version, target.header.version);
}
assert(behavior.dependencies.some((entry) =>
  entry.module_name === "@minecraft/server" && entry.version === "2.11.0"));
console.log("Manifest dependency tests passed");
