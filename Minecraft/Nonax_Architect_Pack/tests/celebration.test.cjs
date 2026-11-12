const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const signal = { subscribe() {} };
const system = { currentTick: 10, runInterval: () => 1, clearRun() {}, runTimeout() {} };
const world = {
  beforeEvents: { playerInteractWithBlock: signal, playerBreakBlock: signal, itemUse: signal },
  afterEvents: { playerBreakBlock: signal, playerPlaceBlock: signal, entitySpawn: signal, entityLoad: signal, entityDie: signal, playerSpawn: signal }
};
const warnings = [];
let carpenters = [];
const service = { loadedCarpenters: () => carpenters, credit: () => 1, suspendCarpenter() {}, reconcileFollow() {} };
const context = vm.createContext({
  world, system, console: { warn: (message) => warnings.push(message) },
  BlockPermutation: { resolve: (id) => ({ id }) }, ItemStack: class {},
  createWorkbenchService: () => service, BLUEPRINTS: {}, validateBlueprint() {}, StructureSaveMode: {},
  quarterTurnsFromFacing() {}, rotateBlueprint() {}, placeOriginAhead() {}
});
const source = fs.readFileSync(path.join(__dirname, "../behavior_pack/Nonax_Architect_Pack/scripts/main.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "");
vm.runInContext(`${source}\nthis.api = { jobs, finishJob, tickJobs };`, context);
const { jobs, finishJob, tickJobs } = context.api;

const dimension = {
  id: "overworld", getBlock: () => ({ typeId: "minecraft:scaffolding", setPermutation: () => order.push("cleanup") }),
  playSound() {}, spawnParticle() {}
};
const order = [];
function actor(id, x = 0, dim = dimension) {
  const props = new Map();
  return {
    id, isValid: true, dimension: dim, location: { x, y: 1, z: 0 }, props,
    getDynamicProperty: (key) => props.get(key),
    setDynamicProperty(key, value) { if (value === undefined) props.delete(key); else props.set(key, value); },
    triggerEvent(event) { order.push(`${id}:${event}`); }
  };
}
const architect = actor("architect"), nearby = actor("nearby", 2);
const far = actor("far", 30), otherDimension = actor("other", 0, { id: "nether" });
carpenters = [nearby, far, otherDimension];
const messages = [];
const job = {
  player: { id: "player", isValid: true, sendMessage: (message) => messages.push(message) },
  architect, dimension, phase: "build", origin: { x: 0, y: 1, z: 0 },
  queue: [{ pos: { x: 0, y: 1, z: 0 } }], index: 1,
  temp: [{ id: "minecraft:scaffolding", pos: { x: 0, y: 1, z: 0 }, placed: true }]
};
jobs.set(job.player.id, job);
finishJob(job, true);
assert.equal(job.phase, "celebrating");
assert(jobs.has(job.player.id));
assert(order.indexOf("cleanup") < order.indexOf("architect:nonax:celebrate"));
assert(order.includes("nearby:nonax:celebrate"));
assert(!order.includes("far:nonax:celebrate"));
assert(!order.includes("other:nonax:celebrate"));
system.currentTick = 69;
tickJobs();
assert(jobs.has(job.player.id));
assert(!order.includes("nearby:nonax:stop_celebrating"));
job.player.isValid = false;
system.currentTick = 70;
tickJobs();
assert(jobs.has(job.player.id));
assert.equal(job.phase, "follow_pending");
system.currentTick = 72;
tickJobs();
assert(!jobs.has(job.player.id));
assert(order.includes("architect:nonax:stop_work"));
assert(order.includes("nearby:nonax:stop_celebrating"));
assert.equal(nearby.getDynamicProperty("nonax:celebrating"), undefined);
console.log("Celebration tests passed");
