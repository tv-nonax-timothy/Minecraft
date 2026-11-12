const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const signal = { subscribe() {} };
const system = { currentTick: 0, runInterval: () => 1, clearRun() {}, runTimeout() {} };
const properties = new Map(), entities = new Map(), events = [];
const world = {
  getDynamicProperty: (key) => properties.get(key),
  setDynamicProperty(key, value) { if (value === undefined) properties.delete(key); else properties.set(key, value); },
  getEntity: (id) => entities.get(id),
  beforeEvents: { playerInteractWithBlock: signal, playerBreakBlock: signal, itemUse: signal },
  afterEvents: { playerBreakBlock: signal, playerPlaceBlock: signal, entitySpawn: signal, entityLoad: signal, entityDie: signal, playerSpawn: signal }
};
let carpenters = [];
const service = {
  loadedCarpenters: () => carpenters,
  isSafeCarpenterFloor: (id) => id === "minecraft:stone",
  suspendCarpenter: (id) => events.push(`suspend:${id}`),
  reconcileFollow: () => events.push("reconcile"),
  credit: () => { events.push("credit"); return 1; }
};
const warnings = [];
const context = vm.createContext({
  world, system, console: { warn: (s) => warnings.push(s) },
  BlockPermutation: { resolve: (id) => ({ id }) }, ItemStack: class {},
  createWorkbenchService: () => service, BLUEPRINTS: {}, validateBlueprint() {}, StructureSaveMode: {},
  quarterTurnsFromFacing() {}, rotateBlueprint() {}, placeOriginAhead() {}
});
const source = fs.readFileSync(path.join(__dirname, "../behavior_pack/Nonax_Architect_Pack/scripts/main.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "");
vm.runInContext(`${source}\nthis.api = { jobs, tickJobs, initializeCarpenters, stepCarpenterMoves, finishJob, carpenterGroundSafe, scaffoldTargetSafe, removeTemporaries, retryPendingTemporaries, forgetChangedTemporary };`, context);
const { jobs, tickJobs, initializeCarpenters, stepCarpenterMoves, finishJob, carpenterGroundSafe, scaffoldTargetSafe, removeTemporaries, retryPendingTemporaries, forgetChangedTemporary } = context.api;

let markerId = 0;
function dimension(surface = 0) {
  const cells = new Map();
  const dim = {
    id: "minecraft:overworld", heightRange: { min: -64, max: 319 },
    getBlock(pos) {
      if (pos.y < this.heightRange.min || pos.y >= this.heightRange.max) {
        throw new Error(`LocationOutOfWorldBoundariesError: ${pos.y}`);
      }
      const key = `${pos.x},${pos.y},${pos.z}`;
      if (!cells.has(key)) cells.set(key, {
        typeId: pos.y <= surface ? "minecraft:stone" : "minecraft:air",
        get isAir() { return this.typeId === "minecraft:air"; }, get isLiquid() { return false; },
        setPermutation(p) {
          this.typeId = p.id;
          events.push(`block:${key}:${p.id}:${system.currentTick}`);
        }
      });
      return cells.get(key);
    },
    spawnEntity(typeId, target) {
      const id = `marker-${++markerId}`;
      const marker = { id, typeId, target, isValid: true, remove() { this.isValid = false; entities.delete(id); } };
      entities.set(id, marker);
      events.push(`marker:${id}:${target.x},${target.y},${target.z}`);
      return marker;
    },
    playSound() {}, spawnParticle() {}
  };
  return dim;
}

function actor(id, dim, rank = 1) {
  const props = new Map([["nonax:rank", rank]]);
  const value = {
    id, isValid: true, isOnGround: true, dimension: dim, location: { x: 8.5, y: 1, z: 0.5 }, nameTag: id,
    getDynamicProperty: (key) => props.get(key),
    setDynamicProperty(key, v) { if (v === undefined) props.delete(key); else props.set(key, v); },
    triggerEvent(event) { events.push(`${id}:${event}:${system.currentTick}`); },
    teleport(pos) { this.location = { ...pos }; events.push(`${id}:teleport:${system.currentTick}`); }
  };
  entities.set(id, value);
  return value;
}

function makeJob(dim, workers, rank = 1, height = 6) {
  const architect = actor(`architect-${jobs.size}`, dim, rank);
  const player = { id: `player-${jobs.size}`, isValid: true, messages: [], sendMessage(m) { this.messages.push(m); } };
  return {
    player, architect, dimension: dim, anchor: { ...architect.location }, phase: "build",
    origin: { x: 0, y: 1, z: 0 }, bp: { size: { x: 3, y: height, z: 3 } },
    queue: [], index: 0, nextTick: 0, temp: [],
    workers
  };
}

function tick(autoMove = true) {
  system.currentTick++;
  tickJobs();
  if (autoMove) {
    for (const job of jobs.values()) {
      if (job.carpenterDestination?.isValid) {
        const worker = job.carpenters[job.carpenterMoves.index];
        worker.location = { ...job.carpenterDestination.target };
      }
    }
  }
}

function reset() { jobs.clear(); properties.clear(); entities.clear(); events.length = 0; warnings.length = 0; system.currentTick = 0; }

{
  reset();
  const dim = dimension(-61), worker = actor("deep", dim), job = makeJob(dim, [worker], 2);
  job.origin.y = -60;
  job.architect.location.y = -60;
  job.anchor.y = -60;
  carpenters = [worker];
  assert.doesNotThrow(() => initializeCarpenters(job));
  assert.equal(job.carpenterGround.length, 1);
  assert.equal(job.carpenterGround[0].y, -60);
  assert.equal(carpenterGroundSafe(job, { x: 0.5, y: -64, z: 0.5 }), false);
  assert.equal(carpenterGroundSafe(job, { x: 0.5, y: 318, z: 0.5 }), false);
  assert.equal(scaffoldTargetSafe(job, { x: 0.5, y: 318, z: 0.5 }), false);
  job.temp = [-2, 4].flatMap((x) => [0, 1].map((layer) =>
    ({ id: "minecraft:scaffolding", pos: { x, y: -60 + layer, z: -2 }, layer })));
  job.bp.size.x = 10;
  job.queue = Array.from({ length: 20 }, (_, i) =>
    ({ pos: { x: i % 10, y: -60 + Math.floor(i / 10), z: 0 }, id: "minecraft:planks" }));
  jobs.set(job.player.id, job);
  for (let i = 0; i < 500 && job.phase !== "celebrating"; i++) tick();
  assert.equal(job.phase, "celebrating");
  assert(events.some((e) => e.includes(":-1.5,-59,-1.5")));
  assert(!warnings.some((message) => message.includes("LocationOutOfWorldBoundariesError")));
}

{
  reset();
  const dim = dimension(), job = makeJob(dim, [], 2);
  dim.getBlock = () => { throw new Error("no candidates should be checked"); };
  carpenters = [];
  assert.doesNotThrow(() => initializeCarpenters(job));
  assert.equal(job.carpenterGround.length, 0);
  assert.equal(job.buildSpeed, 1);
}

{
  reset();
  const dim = dimension(), worker = actor("worker", dim), job = makeJob(dim, [worker], 2);
  carpenters = [worker];
  for (const x of [-2, 4]) for (let layer = 0; layer < 2; layer++) job.temp.push({
    id: "minecraft:scaffolding", pos: { x, y: 1 + layer, z: -2 }, layer
  });
  job.bp.size.x = 10;
  job.queue = Array.from({ length: 20 }, (_, i) =>
    ({ pos: { x: i % 10, y: 1 + Math.floor(i / 10), z: 0 }, id: "minecraft:planks" }));
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  assert.equal(job.buildSpeed, 1.25);
  for (let i = 0; i < 500 && job.phase !== "celebrating"; i++) tick();
  assert.equal(job.phase, "celebrating");
  assert(events.some((e) => e.includes("worker:nonax:start_carpenter_work")));
  assert(events.some((e) => e.includes("worker:nonax:celebrate")));
  assert(events.some((e) => e.includes("worker:nonax:start_carpenter_work")));
  const lower = events.findIndex((e) => e.includes("block:-2,1,-2:minecraft:scaffolding"));
  const upper = events.findIndex((e) => e.includes(",2,-2:minecraft:scaffolding"));
  const cleanup = events.findIndex((e) => e.includes(",2,-2:minecraft:air"));
  assert(lower >= 0 && upper > lower && cleanup > upper);
  const travels = events.map((e, i) => e.includes("worker:nonax:start_carpenter_travel") ? i : -1).filter((i) => i >= 0);
  assert(travels.some((i) => i > upper && i < cleanup));
  assert(events.some((e) => e.includes(":-1.5,2,-1.5")));
  assert(events.some((e) => e.includes(",3,-1.5")));
  assert.equal(worker.getDynamicProperty("nonax:carpenter_recovery"), undefined);
  for (let i = 0; i < 62; i++) tick();
  assert(!jobs.has(job.player.id));
  assert(events.includes("reconcile"));
}

{
  reset();
  const dim = dimension(), workers = [actor("a", dim), actor("b", dim)];
  const job = makeJob(dim, workers, 4, 1);
  job.bp.size.x = 12;
  carpenters = workers;
  for (let x = 0; x < 12; x++) job.queue.push({ pos: { x, y: 1, z: 0 }, id: "minecraft:planks" });
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  assert.equal(job.buildSpeed, 1.5);
  for (let i = 0; i < 500 && job.phase !== "celebrating"; i++) tick();
  const times = events.filter((e) => e.includes(":minecraft:planks:")).map((e) => Number(e.split(":").at(-1)));
  assert.equal(times.length, 12);
  assert.equal(times[10] - times[1], 30);
}

{
  reset();
  const dim = dimension(), worker = actor("slow", dim), job = makeJob(dim, [worker], 2);
  carpenters = [worker];
  job.bp.size.x = 40;
  for (const x of [-2, 41]) for (let layer = 0; layer < 5; layer++) job.temp.push({
    id: "minecraft:scaffolding", pos: { x, y: 1 + layer, z: -2 }, layer
  });
  job.queue = Array.from({ length: 160 }, (_, i) =>
    ({ pos: { x: i % 40, y: 1 + Math.floor(i / 40), z: 0 }, id: "minecraft:planks" }));
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  while (job.phase !== "build") tick();
  const ground = { ...job.carpenterGround[0] };
  for (let i = 0; i < 1000 && !job.finishing; i++) tick(false);
  assert(job.finishing);
  const times = events.filter((e) => e.includes(":minecraft:planks:")).map((e) => Number(e.split(":").at(-1)));
  assert.equal(times.length, 160);
  assert.equal(times[159] - times[1], 158 * 4);
  const groundMarker = `:${ground.x},${ground.y},${ground.z}`;
  assert.equal(events.filter((e) => e.startsWith("marker:") && e.endsWith(groundMarker)).length, 1);
  assert(warnings.some((e) => e.includes("carpenter travel timed out")));
}

{
  reset();
  const dim = dimension(), worker = actor("airborne", dim), job = makeJob(dim, [worker], 1);
  carpenters = [worker];
  job.temp = [{ id: "minecraft:scaffolding", pos: { x: -2, y: 1, z: -2 }, layer: 0, placed: true, tried: true }];
  dim.getBlock(job.temp[0].pos).typeId = "minecraft:scaffolding";
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  while (job.phase !== "build") tick();
  worker.isOnGround = false;
  for (let i = 0; i < 70; i++) tick();
  assert(jobs.has(job.player.id));
  assert.equal(dim.getBlock(job.temp[0].pos).typeId, "minecraft:scaffolding");
  worker.isOnGround = true;
  for (let i = 0; i < 10 && job.phase !== "celebrating"; i++) tick();
  assert.equal(job.phase, "celebrating");
  assert.equal(dim.getBlock(job.temp[0].pos).typeId, "minecraft:air");
}

{
  reset();
  const dim = dimension(), worker = actor("never-landed", dim), job = makeJob(dim, [worker], 1);
  carpenters = [worker];
  job.temp = [{ id: "minecraft:scaffolding", pos: { x: -2, y: 1, z: -2 }, layer: 0, placed: true, tried: true }];
  dim.getBlock(job.temp[0].pos).typeId = "minecraft:scaffolding";
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  while (job.phase !== "build") tick();
  worker.isOnGround = false;
  for (let i = 0; i < 140 && jobs.has(job.player.id); i++) tick();
  assert(!jobs.has(job.player.id));
  assert.equal(dim.getBlock(job.temp[0].pos).typeId, "minecraft:air");
  assert(worker.getDynamicProperty("nonax:carpenter_recovery"));
  assert(job.player.messages.some((m) => m.includes("足場を撤去")));
}

{
  function duration(count) {
    reset();
    const dim = dimension(), workers = count ? [actor("duration", dim)] : [];
    const job = makeJob(dim, workers, 2, 7);
    carpenters = workers;
    job.bp.size.x = 27;
    for (const x of [-2, 28]) for (const z of [-2, 4]) for (let layer = 0; layer < 7; layer++) job.temp.push({
      id: "minecraft:scaffolding", pos: { x, y: 1 + layer, z }, layer
    });
    job.queue = Array.from({ length: 189 }, (_, i) =>
      ({ pos: { x: i % 27, y: 1 + Math.floor(i / 27), z: 0 }, id: "minecraft:planks" }));
    jobs.set(job.player.id, job);
    initializeCarpenters(job);
    for (let i = 0; i < 1500 && job.phase !== "celebrating"; i++) tick(false);
    assert.equal(job.phase, "celebrating");
    return system.currentTick;
  }
  const baseline = duration(0), assisted = duration(1);
  assert(assisted < baseline, `assisted=${assisted}, baseline=${baseline}`);
  console.log(`189-block construction (ticks): no carpenter=${baseline}, one Lv.2 carpenter=${assisted}`);
}

{
  reset();
  const dim = dimension(), worker = actor("timeout", dim), job = makeJob(dim, [worker]);
  carpenters = [worker];
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  for (let i = 0; i < 120; i++) tick(false);
  assert(events.some((e) => e.includes("timeout:teleport")));
  assert(warnings.some((e) => e.includes("carpenter travel timed out")));
}

{
  reset();
  const dim = dimension(), worker = actor("damaged", dim), job = makeJob(dim, [worker]);
  carpenters = [worker];
  job.temp = [{ id: "minecraft:scaffolding", pos: { x: -2, y: 1, z: -2 }, layer: 0, placed: true, tried: true }];
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  for (let i = 0; i < 10 && job.phase !== "build"; i++) tick();
  const ground = job.carpenterGround[0];
  dim.getBlock({ x: Math.floor(ground.x), y: ground.y - 1, z: Math.floor(ground.z) }).typeId = "minecraft:lava";
  for (let i = 0; i < 10 && jobs.has(job.player.id); i++) tick();
  assert(!jobs.has(job.player.id));
  assert(worker.getDynamicProperty("nonax:carpenter_recovery"));
  assert(job.player.messages.some((m) => m.includes("足場を撤去")));
}

{
  reset();
  const dim = dimension(), worker = actor("unloaded", dim), job = makeJob(dim, [worker]);
  carpenters = [worker];
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  job.temp = [{ id: "minecraft:scaffolding", pos: { x: -2, y: 1, z: -2 }, layer: 0, placed: true, tried: true }];
  dim.getBlock(job.temp[0].pos).typeId = "minecraft:scaffolding";
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  worker.isValid = false;
  for (let i = 0; i < 5; i++) tick();
  assert(!jobs.has(job.player.id));
  assert.equal(dim.getBlock(job.temp[0].pos).typeId, "minecraft:air");
  assert(worker.getDynamicProperty("nonax:carpenter_recovery"));
  assert(job.player.messages.some((m) => m.includes("足場を撤去")));
}

{
  reset();
  const dim = dimension(), first = actor("first", dim), second = actor("second", dim);
  const a = makeJob(dim, [first]);
  a.queue = Array.from({ length: 20 }, (_, x) => ({ pos: { x, y: 1, z: 0 }, id: "minecraft:planks" }));
  jobs.set(a.player.id, a);
  carpenters = [first];
  initializeCarpenters(a);
  const b = makeJob(dim, [second]);
  b.queue = Array.from({ length: 20 }, (_, x) => ({ pos: { x, y: 1, z: 1 }, id: "minecraft:planks" }));
  jobs.set(b.player.id, b);
  carpenters = [second];
  initializeCarpenters(b);
  tick(false);
  assert(a.carpenterDestination);
  assert(!b.carpenterDestination);
  first.location = { ...a.carpenterDestination.target };
  tick(false);
  assert(!b.carpenterDestination);
  tick(false);
  assert(b.carpenterDestination);
  assert.equal(entities.size, 5);
}

{
  reset();
  const dim = dimension(), worker = actor("reserved", dim), job = makeJob(dim, [worker]);
  carpenters = [worker];
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  properties.set("nonax:carpenter_marker", "unloaded-marker");
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  for (let i = 0; i < 105; i++) tick();
  assert(!events.some((e) => e.startsWith("marker:")));
  assert(warnings.some((e) => e.includes("carpenter marker unavailable")));
  for (let i = 0; i < 105; i++) tick();
  assert(!jobs.has(job.player.id));
  assert.equal(worker.getDynamicProperty("nonax:carpenter_recovery"), undefined);
}

{
  reset();
  const dim = dimension(), workers = [actor("column-a", dim), actor("column-b", dim)];
  const job = makeJob(dim, workers, 3, 5);
  job.bp.size.x = 30;
  carpenters = workers;
  for (const x of [-2, 31]) for (const z of [-2, 4]) for (let layer = 0; layer < 5; layer++) {
    job.temp.push({ id: "minecraft:scaffolding", pos: { x, y: 1 + layer, z }, layer });
  }
  job.queue = Array.from({ length: 150 }, (_, i) =>
    ({ pos: { x: i % 30, y: 1 + Math.floor(i / 30), z: 0 }, id: "minecraft:planks" }));
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  for (let i = 0; i < 10; i++) tick(false);
  assert(events.some((e) => e.includes(":minecraft:planks:")), "building must not wait for carpenter travel");
  for (let i = 0; i < 1000 && job.phase !== "celebrating"; i++) tick();
  assert.equal(job.phase, "celebrating", JSON.stringify({ warnings, moves: job.carpenterMoves, index: job.index }));
  assert.equal(job.carpenterColumns.length, 2);
  assert.notDeepEqual(job.carpenterColumns[0], job.carpenterColumns[1]);
  for (let i = 0; i < workers.length; i++) {
    const column = job.carpenterColumns[i];
    const travels = warnings.filter((line) => line.includes(`carpenter travel: id=${workers[i].id}`));
    const scaffoldTravels = travels.filter((line) => {
      const target = line.split("target=")[1].split(",").map(Number);
      return target[1] > 1;
    });
    assert(scaffoldTravels.length, `missing scaffold travel for ${workers[i].id}`);
    for (const line of scaffoldTravels) {
      const [x, , z] = line.split("target=")[1].split(",").map(Number);
      assert.equal(Math.floor(x), column.x);
      assert.equal(Math.floor(z), column.z);
    }
  }
}

for (const count of [2, 4]) {
  reset();
  const dim = dimension(), workers = Array.from({ length: count }, (_, i) => actor(`evacuate-${i}`, dim));
  const job = makeJob(dim, workers, count === 2 ? 3 : 5);
  carpenters = workers;
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  job.index = 1;
  const scaffold = { id: "minecraft:scaffolding", pos: { x: -2, y: 1, z: -2 }, layer: 0, placed: true, tried: true };
  job.temp = [scaffold];
  dim.getBlock(scaffold.pos).typeId = scaffold.id;
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  stepCarpenterMoves(job);
  assert(job.carpenterDestination);
  const beforeFinish = events.length;
  finishJob(job, true);
  for (const worker of workers) {
    assert(events.slice(beforeFinish).some((e) => e.includes(`${worker.id}:nonax:start_carpenter_work`)));
  }
  for (let i = 0; i < 50 && job.carpenterMoves?.index < 1; i++) tick();
  assert.equal(job.carpenterMoves.index, 1);
  workers[0].location.x += 2;
  for (let i = 0; i < 100 && job.phase !== "celebrating"; i++) tick();
  assert.equal(job.phase, "celebrating", JSON.stringify(warnings));
  assert(warnings.some((line) => line.includes("carpenter evacuation position restored: id=evacuate-0")));
  assert(warnings.some((line) => line.includes("job end: ok=true placed=1/1")));
  assert.equal(events.filter((e) => e === "credit").length, 1);
  assert.equal(dim.getBlock(scaffold.pos).typeId, "minecraft:air");
  for (const worker of workers) {
    assert.equal(worker.getDynamicProperty("nonax:carpenter_recovery"), undefined);
    assert(events.some((e) => e.includes(`${worker.id}:nonax:celebrate`)));
  }
  for (let i = 0; i < 62; i++) tick();
  assert(!jobs.has(job.player.id));
  assert(events.includes("reconcile"));
}

{
  reset();
  const dim = dimension(), worker = actor("final-airborne", dim);
  const job = makeJob(dim, [worker], 2);
  carpenters = [worker];
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  job.index = 1;
  const scaffold = { id: "minecraft:scaffolding", pos: { x: -2, y: 1, z: -2 }, layer: 0, placed: true, tried: true };
  job.temp = [scaffold];
  dim.getBlock(scaffold.pos).typeId = scaffold.id;
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  finishJob(job, true);
  for (let i = 0; i < 50 && job.phase !== "carpenter_finish"; i++) tick();
  assert.equal(job.phase, "carpenter_finish");
  worker.isOnGround = false;
  for (let i = 0; i < 20; i++) tick();
  assert.equal(dim.getBlock(scaffold.pos).typeId, scaffold.id);
  assert(worker.getDynamicProperty("nonax:carpenter_recovery"));
  assert(!events.includes("credit"));
  worker.isOnGround = true;
  for (let i = 0; i < 10 && job.phase !== "celebrating"; i++) tick();
  assert.equal(job.phase, "celebrating");
  assert.equal(dim.getBlock(scaffold.pos).typeId, "minecraft:air");
  assert.equal(events.filter((e) => e === "credit").length, 1);
}

{
  reset();
  const dim = dimension(), workers = [actor("confirmed-first", dim), actor("lost-second", dim)];
  const job = makeJob(dim, workers, 3);
  carpenters = workers;
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  job.index = 1;
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  finishJob(job, true);
  for (let i = 0; i < 100 && job.phase !== "carpenter_finish"; i++) tick();
  assert.equal(job.phase, "carpenter_finish");
  workers[1].isValid = false;
  tick();
  assert(workers[0].getDynamicProperty("nonax:carpenter_recovery"), "earlier worker recovery must remain until all workers are checked");
  assert(!events.includes("credit"));
}

{
  reset();
  const dim = dimension(), workers = [actor("grounded", dim), actor("unsettled", dim)];
  const job = makeJob(dim, workers, 3);
  carpenters = workers;
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  job.index = 1;
  const scaffold = { id: "minecraft:scaffolding", pos: { x: -2, y: 1, z: -2 }, layer: 0, placed: true, tried: true };
  job.temp = [scaffold];
  dim.getBlock(scaffold.pos).typeId = scaffold.id;
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  finishJob(job, true);
  for (let i = 0; i < 100 && job.phase !== "carpenter_finish"; i++) tick();
  assert.equal(job.phase, "carpenter_finish");
  workers[1].isOnGround = false;
  for (let i = 0; i < 110 && jobs.has(job.player.id); i++) tick();
  assert(!jobs.has(job.player.id));
  assert(warnings.some((line) => line.includes("大工の退避位置を確認できません")));
  assert.equal(dim.getBlock(scaffold.pos).typeId, "minecraft:air");
  assert(workers.every((worker) => worker.getDynamicProperty("nonax:carpenter_recovery")));
  assert(!events.includes("credit"));
}

{
  reset();
  const dim = dimension(), worker = actor("initial-travel", dim), job = makeJob(dim, [worker], 2);
  carpenters = [worker];
  job.phase = "level";
  job.levelOps = [];
  job.levelIndex = 1;
  job.queue = Array.from({ length: 10 }, (_, x) => ({ pos: { x, y: 1, z: 0 }, id: "minecraft:planks" }));
  jobs.set(job.player.id, job);
  tick(false);
  assert.equal(job.phase, "build");
  assert(events.some((e) => e.includes("architect-0:nonax:start_work")));
  assert(!events.some((e) => e.startsWith("marker:")));
  for (let i = 0; i < 10; i++) tick(false);
  assert(events.some((e) => e.includes(":minecraft:planks:")));
  assert(!warnings.some((e) => e.includes("carpenter travel timed out")));
}

{
  reset();
  const dim = dimension(), job = makeJob(dim, []);
  const pos = { x: -2, y: 1, z: -2 };
  const block = dim.getBlock(pos);
  block.typeId = "minecraft:scaffolding";
  job.temp = [{ id: "minecraft:scaffolding", pos, placed: true }];
  const getBlock = dim.getBlock.bind(dim);
  let loaded = false;
  dim.getBlock = (p) => loaded ? getBlock(p) : undefined;
  world.getDimension = () => dim;
  removeTemporaries(job);
  assert(properties.has("nonax:pending_temp_cleanup"));
  loaded = true;
  retryPendingTemporaries();
  assert.equal(block.typeId, "minecraft:air");
  assert(!properties.has("nonax:pending_temp_cleanup"));

  loaded = false;
  block.typeId = "minecraft:scaffolding";
  removeTemporaries(job);
  forgetChangedTemporary({ block: { location: pos }, dimension: dim });
  loaded = true;
  retryPendingTemporaries();
  assert.equal(block.typeId, "minecraft:scaffolding", "player replacement must not be removed");
}

{
  reset();
  const dim = dimension(), worker = actor("blocked", dim), job = makeJob(dim, [worker]);
  carpenters = [worker];
  const getBlock = dim.getBlock.bind(dim);
  dim.getBlock = (pos) => pos.y <= 0 ? { typeId: "minecraft:lava", isAir: false } : getBlock(pos);
  assert.throws(() => initializeCarpenters(job), /地上/);
  assert.equal(worker.getDynamicProperty("nonax:carpenter_recovery"), undefined);
}

{
  reset();
  const dim = dimension(), worker = actor("interrupted", dim), job = makeJob(dim, [worker]);
  carpenters = [worker];
  job.queue = [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:planks" }];
  jobs.set(job.player.id, job);
  initializeCarpenters(job);
  job.player.isValid = false;
  for (let i = 0; i < 50 && jobs.has(job.player.id); i++) tick();
  assert(!jobs.has(job.player.id));
  assert.equal(worker.getDynamicProperty("nonax:carpenter_recovery"), undefined);
  assert(events.some((e) => e.includes("interrupted:nonax:stop_celebrating")));
}

console.log("Carpenter construction tests passed");
