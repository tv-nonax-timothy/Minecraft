const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const callbacks = {};
const signal = (name) => ({ subscribe: (callback) => { callbacks[name] = callback; } });
const world = {
  getTimeOfDay: () => 6000,
  beforeEvents: { playerInteractWithBlock: signal("interact"), playerBreakBlock: signal("beforeBreak"), itemUse: signal("use") },
  afterEvents: { playerBreakBlock: signal("break"), playerPlaceBlock: signal("place"), entitySpawn: signal("spawn"), entityLoad: signal("load"), entityDie: signal("die"), playerSpawn: signal("playerSpawn") }
};
const system = { currentTick: 10, runInterval: () => 1, clearRun() {}, runTimeout() {} };
const context = vm.createContext({
  world, system, console: { warn() {} },
  BlockPermutation: { resolve: (id, states) => ({ type: { id }, states }) },
  ItemStack: class {}, createWorkbenchService: () => ({ isActive: () => true, placed() {}, capturePlacement() {} }),
  BLUEPRINTS: {}, validateBlueprint() {}, StructureSaveMode: {},
  quarterTurnsFromFacing: () => 0, rotateBlueprint: (bp) => ({ blueprint: bp }),
  placeOriginAhead: (click) => ({ x: click.x, z: click.z })
});
const source = fs.readFileSync(path.join(__dirname, "../behavior_pack/Nonax_Architect_Pack/scripts/main.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "");
vm.runInContext(`${source}\nthis.api = { jobs, tickJobs, planSign, planLeveling, removeTemporaries };`, context);
const { jobs, tickJobs, planSign, planLeveling, removeTemporaries } = context.api;

function makeDimension() {
  const cells = new Map(), writes = [];
  const key = (p) => `${p.x},${p.y},${p.z}`;
  const dimension = {
    id: "test",
    writes,
    failSign: false,
    failSignText: false,
    failFenceAt: undefined,
    getBlock(pos) {
      const k = key(pos);
      if (!cells.has(k)) {
        const block = {
          location: { ...pos }, dimension, typeId: pos.y <= 0 ? "minecraft:stone" : "minecraft:air",
          text: "", raw: undefined, back: "", isWaxed: false, states: undefined,
          get isAir() { return this.typeId === "minecraft:air"; },
          get isLiquid() { return false; },
          setPermutation(permutation) {
            if (dimension.failSign && permutation.type.id === "minecraft:standing_sign") throw new Error("sign placement failed");
            if (permutation.type.id === "minecraft:oak_fence" && dimension.failFenceAt === k) throw new Error("fence placement failed");
            this.typeId = permutation.type.id;
            this.states = permutation.states;
            this.text = "";
            this.raw = undefined;
            this.back = "";
            writes.push({ ...pos, id: this.typeId });
          },
          getComponent(id) {
            if (id !== "minecraft:sign" || this.typeId !== "minecraft:standing_sign") return undefined;
            return {
              get isWaxed() { return block.isWaxed; },
              getText(side) { return side === "Back" ? block.back : block.text; },
              getRawText() { return block.raw; },
              setText(text, side) {
                if (dimension.failSignText) throw new Error("sign text failed");
                if (side === "Back") block.back = text;
                else if (typeof text === "string") block.text = text;
                else block.raw = text;
              }
            };
          }
        };
        cells.set(k, block);
      }
      return cells.get(k);
    },
    playSound() {}, spawnParticle() {}
  };
  return dimension;
}

function makeJob(dimension) {
  const messages = [];
  const player = { id: "player", isValid: true, sendMessage: (message) => messages.push(message) };
  const bp = { name: "test", signName: "nonax.structure.test", size: { x: 4, y: 1, z: 2 } };
  return {
    player, dimension, bp, origin: { x: 0, y: 1, z: 0 },
    queue: [{ pos: { x: 0, y: 1, z: 0 }, id: "minecraft:stone" }],
    index: 0, nextTick: 0, temp: [], phase: "arrive", arriveTick: 0, levelIndex: 0, messages,
    facing: { x: 0, z: 1 }
  };
}

function start(dimension) {
  jobs.clear();
  system.currentTick = 10;
  const job = makeJob(dimension);
  jobs.set(job.player.id, job);
  tickJobs();
  return job;
}

{
  const dimension = makeDimension();
  const bp = { size: { x: 4, y: 1, z: 2 } }, origin = { x: 0, y: 1, z: 0 };
  for (const [facing, pos, direction] of [
    [{ x: 0, z: 1 }, { x: 1, y: 1, z: -2 }, 8],
    [{ x: -1, z: 0 }, { x: 5, y: 1, z: 0 }, 12],
    [{ x: 0, z: -1 }, { x: 1, y: 1, z: 3 }, 0],
    [{ x: 1, z: 0 }, { x: -2, y: 1, z: 0 }, 4]
  ]) {
    const sign = planSign(dimension, bp, origin, facing);
    assert.deepEqual({ ...sign.pos }, pos);
    assert.equal(sign.direction, direction);
  }
  const facing = { x: 0, z: 1 };
  for (const x of [1, 0]) dimension.getBlock({ x, y: 1, z: -2 }).typeId = "minecraft:stone";
  assert.deepEqual({ ...planSign(dimension, bp, origin, facing).pos }, { x: 2, y: 1, z: -2 });
  dimension.getBlock({ x: 2, y: 1, z: -2 }).typeId = "minecraft:stone";
  const alternate = planSign(dimension, bp, origin, facing);
  assert.deepEqual({ ...alternate.pos }, { x: 5, y: 1, z: 0 });
  assert.equal(alternate.direction, 12);
}

{
  const dimension = makeDimension();
  dimension.getBlock({ x: 0, y: 1, z: 0 }).typeId = "minecraft:short_grass";
  const job = start(dimension);
  const sign = job.temp.find((t) => t.id === "minecraft:standing_sign");
  assert.deepEqual({ ...sign.pos }, { x: 1, y: 1, z: -2 });
  const signBlock = dimension.getBlock(sign.pos);
  assert.equal(signBlock.states.ground_sign_direction, 8);
  assert.equal(signBlock.raw.rawtext[0].translate, "nonax.site.building");
  assert.equal(signBlock.raw.rawtext[2].translate, "nonax.structure.test");
  assert.equal(signBlock.back, sign.token);
  assert.equal(job.phase, "level");
  assert(dimension.writes.slice(0, -1).every((w) => w.id === "minecraft:oak_fence"));
  assert.equal(dimension.writes.at(-1).id, "minecraft:standing_sign");
  assert.equal(dimension.getBlock({ x: 0, y: 1, z: 0 }).typeId, "minecraft:short_grass");
  assert(!planLeveling(dimension, job.bp, job.origin).ops.some((op) =>
    op.pos.x === sign.pos.x && op.pos.y === sign.pos.y && op.pos.z === sign.pos.z));
  system.currentTick = 15;
  tickJobs();
  assert.equal(job.phase, "build");
  assert.equal(dimension.getBlock(sign.pos).typeId, "minecraft:standing_sign");
  system.currentTick = 20;
  tickJobs();
  assert.equal(dimension.getBlock(sign.pos).typeId, "minecraft:air");
  assert(job.messages.some((m) => m.includes("完了")));
}

{
  const dimension = makeDimension();
  for (let x = 0; x < 7; x++) {
    dimension.getBlock({ x, y: 1, z: -1 }).typeId = "minecraft:stone";
    dimension.getBlock({ x, y: 1, z: -2 }).typeId = "minecraft:stone";
  }
  const job = makeJob(dimension);
  job.bp.size = { x: 7, y: 9, z: 9 };
  job.bp.groundOffset = -1;
  job.origin.y = 0;
  job.queue[0].pos.y = 0;
  jobs.clear();
  system.currentTick = 10;
  jobs.set(job.player.id, job);
  tickJobs();
  const sign = job.temp.find((t) => t.id === "minecraft:standing_sign");
  assert.deepEqual({ ...sign.pos }, { x: 8, y: 1, z: 4 });
  assert.equal(sign.side, "east");
  assert(job.messages.some((m) => m.includes("看板の設置位置を変更")));
  for (const op of job.levelOps) {
    assert(!(op.pos.z === -1 && op.pos.x >= 0 && op.pos.x < 7));
  }
  while (jobs.has(job.player.id) && system.currentTick < 1000) {
    system.currentTick += 5;
    tickJobs();
  }
  assert(!jobs.has(job.player.id));
  assert(job.messages.some((m) => m.includes("完了")));
  for (let x = 0; x < 7; x++) {
    assert.equal(dimension.getBlock({ x, y: 1, z: -1 }).typeId, "minecraft:stone");
    assert.equal(dimension.getBlock({ x, y: 1, z: -2 }).typeId, "minecraft:stone");
  }
  assert(dimension.getBlock(sign.pos).isAir);
}

{
  const dimension = makeDimension();
  dimension.getBlock({ x: 1, y: 1, z: -2 }).typeId = "minecraft:stone";
  const job = start(dimension);
  const sign = job.temp.find((t) => t.id === "minecraft:standing_sign");
  assert.deepEqual({ ...sign.pos }, { x: 0, y: 1, z: -2 });
  assert.equal(sign.side, "north");
  assert(job.messages.some((m) => m.includes("看板の設置位置を変更")));
  removeTemporaries(job);
}

{
  const dimension = makeDimension();
  const occupied = { x: -1, y: 1, z: 0 };
  dimension.getBlock(occupied).typeId = "minecraft:stone";
  dimension.getBlock({ x: -1, y: 2, z: 0 }).typeId = "minecraft:short_grass";
  dimension.getBlock({ x: 0, y: 2, z: -1 }).typeId = "minecraft:short_grass";
  dimension.getBlock({ x: 0, y: 1, z: 0 }).typeId = "minecraft:short_grass";
  const level = planLeveling(dimension, makeJob(dimension).bp, { x: 0, y: 1, z: 0 });
  assert(!level.ops.some((op) => op.pos.x === -1 && op.pos.z === 0));
  assert(level.ops.some((op) => op.pos.x === 0 && op.pos.y === 2 && op.pos.z === -1));
  assert(level.ops.some((op) => op.pos.x === 0 && op.pos.y === 1 && op.pos.z === 0));
}

{
  const dimension = makeDimension();
  jobs.clear();
  system.currentTick = 10;
  const job = makeJob(dimension);
  job.bp.groundOffset = -1;
  job.origin.y = 0;
  job.queue[0].pos.y = 0;
  jobs.set(job.player.id, job);
  tickJobs();
  const sign = job.temp.find((t) => t.id === "minecraft:standing_sign");
  assert.equal(sign.pos.y, 1);
  assert(job.levelOps.some((op) => op.pos.y === 0 && op.id === "minecraft:air"));
  assert(!job.levelOps.some((op) => op.pos.x === sign.pos.x && op.pos.z === sign.pos.z));
  system.currentTick = 15;
  tickJobs();
  assert.equal(dimension.getBlock(sign.pos).typeId, "minecraft:standing_sign");
  removeTemporaries(job);
}

{
  const dimension = makeDimension();
  dimension.failSign = true;
  const job = start(dimension);
  assert(!jobs.has(job.player.id));
  assert(job.messages.some((m) => m.includes("sign placement failed")));
  assert(job.temp.filter((t) => t.id === "minecraft:oak_fence").every((t) => dimension.getBlock(t.pos).isAir));
}

{
  const dimension = makeDimension();
  dimension.failSignText = true;
  const job = start(dimension);
  assert(!jobs.has(job.player.id));
  assert(job.messages.some((m) => m.includes("sign text failed")));
  assert(job.temp.filter((t) => t.placed).every((t) => dimension.getBlock(t.pos).isAir));
}

{
  const dimension = makeDimension();
  dimension.failFenceAt = "-1,1,1";
  const job = start(dimension);
  assert(!jobs.has(job.player.id));
  assert(job.messages.some((m) => m.includes("fence placement failed")));
  assert(job.temp.filter((t) => t.placed).every((t) => dimension.getBlock(t.pos).isAir));
}

{
  const dimension = makeDimension();
  for (const x of [0, 1, 2]) for (const z of [-2, 3]) dimension.getBlock({ x, y: 1, z }).typeId = "minecraft:stone";
  for (const x of [-2, 5]) for (const z of [0, 1]) dimension.getBlock({ x, y: 1, z }).typeId = "minecraft:stone";
  const job = start(dimension);
  assert(!jobs.has(job.player.id));
  assert(job.messages.some((m) => m.includes("看板")));
  assert.equal(dimension.writes.length, 0);
}

{
  const dimension = makeDimension();
  dimension.getBlock({ x: 0, y: 1, z: 0 }).typeId = "minecraft:short_grass";
  const job = start(dimension);
  const sign = job.temp.find((t) => t.id === "minecraft:standing_sign");
  dimension.getBlock({ x: 0, y: 1, z: 0 }).typeId = "minecraft:chest";
  system.currentTick = 15;
  tickJobs();
  assert(!jobs.has(job.player.id));
  assert(job.messages.some((m) => m.includes("整地先")));
  assert(dimension.getBlock(sign.pos).isAir);
  assert.equal(dimension.getBlock({ x: 0, y: 1, z: 0 }).typeId, "minecraft:chest");
}

{
  const dimension = makeDimension();
  const job = start(dimension);
  const sign = job.temp.find((t) => t.id === "minecraft:standing_sign");
  dimension.getBlock(sign.pos).typeId = "minecraft:air";
  system.currentTick = 15;
  tickJobs();
  assert(!jobs.has(job.player.id));
  assert(job.messages.some((m) => m.includes("看板")));
  assert(job.temp.filter((t) => t.id === "minecraft:oak_fence").every((t) => dimension.getBlock(t.pos).isAir));
}

{
  const dimension = makeDimension();
  const job = start(dimension);
  system.currentTick = 15;
  tickJobs();
  assert.equal(job.phase, "build");
  const getBlock = dimension.getBlock.bind(dimension);
  dimension.getBlock = (pos) => pos.x === 0 && pos.y === 1 && pos.z === 0 ? undefined : getBlock(pos);
  system.currentTick = 20;
  tickJobs();
  assert(!jobs.has(job.player.id));
  assert(job.messages.includes("§c施主が不在になったので、建築を中断します"));
  assert(job.temp.filter((t) => t.placed).every((t) => getBlock(t.pos).isAir));
}

{
  const dimension = makeDimension();
  const job = start(dimension);
  system.currentTick = 15;
  tickJobs();
  dimension.getBlock(job.queue[0].pos).typeId = "minecraft:chest";
  system.currentTick = 20;
  tickJobs();
  assert(!jobs.has(job.player.id));
  assert(job.messages.includes("§c建築を中断しました: 設置先に別のブロックが置かれました"));
}

{
  const dimension = makeDimension();
  const job = start(dimension);
  const sign = job.temp.find((t) => t.id === "minecraft:standing_sign");
  const block = dimension.getBlock(sign.pos);
  callbacks.break({ block, dimension });
  block.typeId = "minecraft:standing_sign";
  block.raw = JSON.parse(sign.front);
  block.back = sign.token;
  removeTemporaries(job);
  assert.equal(block.typeId, "minecraft:standing_sign");
}

{
  const dimension = makeDimension();
  const job = start(dimension);
  const sign = job.temp.find((t) => t.id === "minecraft:standing_sign");
  dimension.getBlock(sign.pos).back = "player text";
  removeTemporaries(job);
  assert.equal(dimension.getBlock(sign.pos).typeId, "minecraft:standing_sign");
}

{
  const dimension = makeDimension();
  const job = start(dimension);
  const sign = job.temp.find((t) => t.id === "minecraft:standing_sign");
  dimension.getBlock(sign.pos).raw = { rawtext: [{ text: "player text" }] };
  removeTemporaries(job);
  assert.equal(dimension.getBlock(sign.pos).typeId, "minecraft:standing_sign");
}

console.log("Site preparation tests passed");
