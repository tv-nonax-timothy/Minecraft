const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../behavior_pack/Nonax_Architect_Pack");
const parse = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const item = parse("items/nonax_architect_workbench.json")["minecraft:item"];
const block = parse("blocks/nonax_architect_workbench.json")["minecraft:block"];
const recipe = parse("recipes/nonax_architect_workbench.json")["minecraft:recipe_shapeless"];

assert.equal(item.description.identifier, block.description.identifier);
assert.equal(item.components["minecraft:block_placer"].block, block.description.identifier);
assert.equal(item.components["minecraft:block_placer"].replace_block_item, true);
assert.equal(item.components["minecraft:max_stack_size"], 1);
assert.equal(recipe.result.item, item.description.identifier);
const nameKey = item.components["minecraft:display_name"].value;
assert.equal(nameKey, "tile.nonax:architect_workbench.name");
for (const [locale, expected] of [["ja_JP", "棟梁の作業台"], ["en_US", "Master Builder's Workbench"]]) {
  const text = fs.readFileSync(path.join(__dirname, "../resource_pack/Nonax_Architect_Pack/texts", `${locale}.lang`), "utf8");
  const matches = text.split(/\r?\n/).filter((line) => line.startsWith(`${nameKey}=`));
  assert.deepEqual(matches, [`${nameKey}=${expected}`]);
}
console.log("Workbench item definition tests passed");
