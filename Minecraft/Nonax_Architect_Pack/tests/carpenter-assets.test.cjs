const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const bp = path.join(root, "behavior_pack", "Nonax_Architect_Pack");
const rp = path.join(root, "resource_pack", "Nonax_Architect_Pack");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const carpenter = read(path.join(bp, "entities", "nonax_carpenter.json"))["minecraft:entity"];
const marker = read(path.join(bp, "entities", "nonax_carpenter_destination.json"))["minecraft:entity"];
const markerClient = read(path.join(rp, "entity", "nonax_carpenter_destination.entity.json"))["minecraft:client_entity"].description;
const architect = read(path.join(bp, "entities", "nonax_architect.json"))["minecraft:entity"];
const client = read(path.join(rp, "entity", "nonax_carpenter.entity.json"))["minecraft:client_entity"].description;
const architectClient = read(path.join(rp, "entity", "nonax_architect.entity.json"))["minecraft:client_entity"].description;
const animation = read(path.join(rp, "animations", "nonax_architect.animation.json")).animations;
const controller = read(path.join(rp, "animation_controllers", "nonax_architect.animation_controllers.json"))
  .animation_controllers["controller.animation.nonax_architect.work"];

assert.equal(carpenter.description.identifier, client.identifier);
assert.equal(client.geometry.default, architectClient.geometry.default);
assert.equal(client.geometry.hammer, architectClient.geometry.hammer);
assert.equal(carpenter.component_groups["nonax:working"]["minecraft:mark_variant"].value, 1);
assert.equal(carpenter.component_groups["nonax:celebrating"]["minecraft:movement"].value, 0);
assert(carpenter.events["nonax:stop_celebrating"].remove.component_groups.includes("nonax:celebrating"));
assert.equal(carpenter.component_groups["nonax:idle"]["minecraft:mark_variant"].value, 0);
assert.equal(carpenter.component_groups["nonax:idle"]["minecraft:movement"].value, 0.5);
assert.equal(marker.description.identifier, markerClient.identifier);
assert(marker.components["minecraft:type_family"].family.includes("nonax_carpenter_destination"));
assert.deepEqual(carpenter.component_groups["nonax:traveling"]["minecraft:behavior.follow_mob"].control_flags, ["move", "look", "jump"]);
assert.equal(carpenter.component_groups["nonax:fall_protection"]["minecraft:damage_sensor"].triggers.cause, "fall");
for (const event of ["nonax:start_carpenter_travel", "nonax:start_carpenter_work"]) {
  for (let slot = 1; slot <= 20; slot++) assert(carpenter.events[event].remove.component_groups.includes(`nonax:follow_${slot}`));
  assert(carpenter.events[event].add.component_groups.includes("nonax:fall_protection"));
}
assert(!carpenter.events["minecraft:entity_spawned"].add.component_groups.includes("nonax:working"));
assert(architect.components["minecraft:type_family"].family.includes("mob"));
for (let slot = 1; slot <= 20; slot++) {
  const name = `nonax:follow_${slot}`;
  const goal = carpenter.component_groups[name]["minecraft:behavior.follow_mob"];
  assert.equal(goal.search_range, 80);
  assert.equal(goal.stop_distance, 2);
  assert.deepEqual(goal.control_flags, ["move", "look", "jump"]);
  assert(goal.filters.all_of.some((filter) => filter.test === "is_family" && filter.subject === "other" && filter.value === "nonax_architect"));
  assert(goal.filters.all_of.some((filter) => filter.test === "has_tag" && filter.subject === "other" && filter.value === `nonax_follow_v2_${slot}`));
  assert(carpenter.events[name].add.component_groups.includes(name));
  assert.equal(carpenter.events[name].remove.component_groups.length, 19);
}
for (let rank = 1; rank <= 5; rank++) {
  const group = `nonax:rank_${rank}`;
  assert.equal(carpenter.component_groups[group]["minecraft:variant"].value, rank);
  assert(carpenter.events[`nonax:set_rank_${rank}`].add.component_groups.includes(group));
  assert(fs.existsSync(path.join(rp, `${client.textures[`rank${rank}`]}.png`)));
}
for (const entity of [carpenter, architect]) {
  assert.equal(entity.component_groups["nonax:celebrating"]["minecraft:mark_variant"].value, 2);
  assert(entity.events["nonax:celebrate"].add.component_groups.includes("nonax:celebrating"));
}
assert(animation[client.animations.celebrate]);
assert.equal(client.animations.celebrate, architectClient.animations.celebrate);
assert(controller.states.celebrating.animations.includes("celebrate"));
assert.deepEqual(controller.states.working.transitions[0], { celebrating: "query.mark_variant == 2" });
console.log("Carpenter asset tests passed");
