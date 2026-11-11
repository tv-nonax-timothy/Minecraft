const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const signal = { subscribe() {} };
const system = { currentTick: 0, runInterval: () => 1, clearRun() {}, runTimeout() {} };
const world = {
  getTimeOfDay: () => 6000,
  beforeEvents: { playerInteractWithBlock: signal, itemUse: signal },
  afterEvents: { playerBreakBlock: signal, playerPlaceBlock: signal, entitySpawn: signal }
};
const warnings = [];
const context = vm.createContext({
  world, system, console: { warn: (message) => warnings.push(message) },
  BlockPermutation: { resolve: (id, states) => ({ type: { id }, states }) },
  BLUEPRINTS: {}, validateBlueprint() {}, StructureSaveMode: {},
  quarterTurnsFromFacing() {}, rotateBlueprint() {}, placeOriginAhead() {}
});
const source = fs.readFileSync(path.join(__dirname, "../behavior_pack/Nonax_Architect_Pack/scripts/main.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "");
vm.runInContext(`${source}\nthis.api = { jobs, tickJobs, summonArchitectToSite, findNearestArchitect };`, context);
const { jobs, tickJobs, summonArchitectToSite, findNearestArchitect } = context.api;

{
  const entityDir = path.join(__dirname, "../behavior_pack/Nonax_Architect_Pack/entities");
  const architect = JSON.parse(fs.readFileSync(path.join(entityDir, "nonax_architect.json"), "utf8"))["minecraft:entity"];
  const marker = JSON.parse(fs.readFileSync(path.join(entityDir, "nonax_architect_destination.json"), "utf8"))["minecraft:entity"];
  const follow = architect.component_groups["nonax:traveling"]["minecraft:behavior.follow_mob"];
  assert(marker.components["minecraft:type_family"].family.includes("mob"));
  assert(marker.components["minecraft:type_family"].family.includes(follow.filters.value));
  assert.equal(marker.components["minecraft:physics"].has_gravity, false);
  assert.equal(marker.components["minecraft:physics"].has_collision, false);
  assert.deepEqual(follow.control_flags, ["move", "look", "jump"]);
}

function makeDimension() {
  const dimension = {
    id: "overworld", heightRange: { min: -64, max: 319 }, markers: [], writes: [],
    safe: true, failSpawn: false, architects: [],
    getBlock(pos) {
      if (!this.safe) return undefined;
      return {
        typeId: pos.y <= 0 ? "minecraft:stone" : "minecraft:air",
        isAir: pos.y > 0, isLiquid: false,
        setPermutation(permutation) { dimension.writes.push(permutation.type.id); }
      };
    },
    getEntities() { return this.architects; },
    spawnEntity(type, pos) {
      assert.equal(type, "nonax:architect_destination");
      if (this.failSpawn) throw new Error("spawn failed");
      const marker = { isValid: true, pos: { ...pos }, remove() { this.isValid = false; } };
      this.markers.push(marker);
      return marker;
    },
    playSound() {}, spawnParticle() {}
  };
  return dimension;
}

function makeArchitect(dimension, id = "architect") {
  const actor = {
    id, isValid: true, dimension, location: { x: 20, y: 1, z: 0 }, nameTag: "棟梁", events: [], teleports: [],
    triggerEvent(event) { this.events.push(event); },
    teleport(pos) { this.teleports.push({ ...pos }); this.location = { ...pos }; }
  };
  dimension.architects.push(actor);
  return actor;
}

function makeJob(dimension, actor, id = "player") {
  const messages = [];
  return {
    player: { id, isValid: true, sendMessage: (message) => messages.push(message) },
    architect: actor, dimension, messages,
    bp: { name: "test", size: { x: 4, y: 1, z: 2 } },
    origin: { x: 0, y: 1, z: 0 }, facing: { x: 0, z: 1 },
    phase: "travel_pending", queue: [{ pos: { x: 0, y: 1, z: 0 } }],
    index: 0, nextTick: 0, temp: [], levelIndex: 0
  };
}

function reset() {
  jobs.clear();
  system.currentTick = 0;
  warnings.length = 0;
}

{
  reset();
  const dimension = makeDimension(), actor = makeArchitect(dimension), job = makeJob(dimension, actor);
  jobs.set(job.player.id, job);
  assert.equal(summonArchitectToSite(job), true);
  assert.equal(job.phase, "travel");
  assert.deepEqual(actor.events, ["nonax:start_travel"]);
  assert.equal(job.messages[0].rawtext[1].translate, "nonax.architect.en_route");
  system.currentTick = 100;
  tickJobs();
  assert.equal(job.phase, "travel");
  assert.equal(dimension.writes.length, 0);
  assert(warnings.some((message) => message.includes("architect travel progress: moved=0.0") && message.includes("destination_valid=true")));
  actor.location = { ...job.travelTarget };
  tickJobs();
  assert.equal(job.phase, "arrive");
  assert.equal(job.arriveTick, 130);
  assert.equal(dimension.markers[0].isValid, false);
  assert.deepEqual(actor.events, ["nonax:start_travel", "nonax:start_work"]);
  assert.equal(actor.teleports.length, 0);
  system.currentTick = 129;
  tickJobs();
  assert.equal(dimension.writes.length, 0);
}

{
  reset();
  const dimension = makeDimension(), actor = makeArchitect(dimension), job = makeJob(dimension, actor);
  actor.location = { x: 7.5, y: 1, z: 0.5 };
  jobs.set(job.player.id, job);
  summonArchitectToSite(job);
  assert.equal(job.phase, "arrive");
  assert.equal(dimension.markers.length, 0);
  assert.equal(actor.teleports.length, 0);
  assert.equal(job.messages.length, 0);
  assert.deepEqual(actor.events, ["nonax:start_work"]);
}

{
  reset();
  const dimension = makeDimension(), actor = makeArchitect(dimension), job = makeJob(dimension, actor);
  jobs.set(job.player.id, job);
  summonArchitectToSite(job);
  system.currentTick = 599;
  tickJobs();
  assert.equal(actor.teleports.length, 0);
  system.currentTick = 600;
  tickJobs();
  assert.equal(actor.teleports.length, 1);
  assert.equal(job.phase, "arrive");
  assert.equal(job.messages.length, 1);
  assert.equal(job.messages[0].rawtext[1].translate, "nonax.architect.en_route");
  assert(warnings.some((message) => message.includes("architect travel timed out; teleporting")));
  assert.equal(dimension.markers[0].isValid, false);
  assert.equal(dimension.writes.length, 0);
}

{
  reset();
  const dimension = makeDimension(), actor = makeArchitect(dimension), job = makeJob(dimension, actor);
  jobs.set(job.player.id, job);
  summonArchitectToSite(job);
  dimension.safe = false;
  system.currentTick = 600;
  tickJobs();
  assert.equal(actor.teleports.length, 0);
  assert.equal(jobs.has(job.player.id), false);
  assert.equal(dimension.markers[0].isValid, false);
  assert(job.messages.some((message) => typeof message === "string" && message.includes("中断")));
  assert(actor.events.includes("nonax:stop_work"));
}

{
  reset();
  const dimension = makeDimension(), actor = makeArchitect(dimension), job = makeJob(dimension, actor);
  jobs.set(job.player.id, job);
  summonArchitectToSite(job);
  actor.teleport = () => { throw new Error("teleport failed"); };
  system.currentTick = 600;
  tickJobs();
  assert.equal(jobs.has(job.player.id), false);
  assert.equal(dimension.markers[0].isValid, false);
  assert.equal(job.messages.filter((message) => message.rawtext).length, 1);
  assert(job.messages.some((message) => typeof message === "string" && message.includes("中断")));
}

{
  reset();
  const dimension = makeDimension(), actor = makeArchitect(dimension), job = makeJob(dimension, actor);
  dimension.failSpawn = true;
  jobs.set(job.player.id, job);
  tickJobs();
  assert.equal(jobs.has(job.player.id), false);
  assert(job.messages.some((message) => typeof message === "string" && message.includes("中断")));
  assert(actor.events.includes("nonax:stop_work"));
}

{
  reset();
  const dimension = makeDimension(), first = makeArchitect(dimension, "first"), second = makeArchitect(dimension, "second");
  const firstJob = makeJob(dimension, first, "first-player"), secondJob = makeJob(dimension, second, "second-player");
  jobs.set(firstJob.player.id, firstJob);
  jobs.set(secondJob.player.id, secondJob);
  assert.equal(summonArchitectToSite(firstJob), true);
  assert.equal(summonArchitectToSite(secondJob), false);
  assert.equal(secondJob.phase, "travel_pending");
  assert.equal(dimension.markers.length, 1);
  assert.equal(findNearestArchitect(dimension, { x: 20, y: 1, z: 0 }, true), undefined);
  first.location = { ...firstJob.travelTarget };
  tickJobs();
  assert.equal(firstJob.phase, "arrive");
  assert.equal(secondJob.phase, "travel");
  assert.equal(dimension.markers.length, 2);
}

{
  reset();
  const dimension = makeDimension(), actor = makeArchitect(dimension), job = makeJob(dimension, actor);
  jobs.set(job.player.id, job);
  summonArchitectToSite(job);
  job.player.isValid = false;
  tickJobs();
  assert.equal(jobs.size, 0);
  assert.equal(dimension.markers[0].isValid, false);
  assert(actor.events.includes("nonax:stop_work"));
}

console.log("Architect travel tests passed");
