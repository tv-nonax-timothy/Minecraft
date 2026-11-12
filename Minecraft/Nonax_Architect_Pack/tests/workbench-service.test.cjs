const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scripts = path.join(__dirname, "../behavior_pack/Nonax_Architect_Pack/scripts");
const ledger = fs.readFileSync(path.join(scripts, "workbench-ledger.js"), "utf8").replace(/^export /gm, "");
const service = fs.readFileSync(path.join(scripts, "workbench-service.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const context = vm.createContext({ console: { warn() {} } });
vm.runInContext(`${ledger}\n${service}\nthis.create = createWorkbenchService;`, context);

function fixture(legacy = true) {
  const properties = new Map(), actors = new Map(), cells = new Map(), scheduled = [];
  let actorNumber = 0;
  const system = { currentTick: 10, run: (fn) => scheduled.push(fn) };
  const world = {
    failSave: false,
    getDynamicProperty: (key) => properties.get(key),
    setDynamicProperty(key, value) {
      if (this.failSave) throw new Error("save failed");
      properties.set(key, value);
    },
    getEntity: (id) => actors.get(id),
    getAllPlayers: () => [player]
  };
  class ItemStack {
    constructor(typeId) { this.typeId = typeId; this.props = new Map(); }
    getDynamicProperty(key) { return this.props.get(key); }
    setDynamicProperty(key, value) { this.props.set(key, value); }
  }
  const dimension = {
    id: "minecraft:overworld",
    getBlock(pos) {
      const key = `${pos.x},${pos.y},${pos.z}`;
      if (!cells.has(key)) {
        cells.set(key, {
          dimension, location: { x: pos.x, y: pos.y, z: pos.z }, typeId: "minecraft:air",
          get isAir() { return this.typeId === "minecraft:air"; },
          setPermutation(p) { this.typeId = p.id; }
        });
      }
      return cells.get(key);
    },
    getEntities({ type }) { return [...actors.values()].filter((actor) => actor.typeId === type); },
    spawnEntity(typeId) {
      const actor = {
        typeId, id: `actor-${++actorNumber}`, isValid: true, props: new Map(), events: [], tags: new Set(),
        getDynamicProperty(key) { return this.props.get(key); },
        setDynamicProperty(key, value) { this.props.set(key, value); },
        hasTag(tag) { return this.tags.has(tag); },
        addTag(tag) { this.tags.add(tag); },
        triggerEvent(event) { this.events.push(event); },
        remove() { this.isValid = false; actors.delete(this.id); }
      };
      actors.set(actor.id, actor);
      return actor;
    }
  };
  world.getDimension = () => dimension;
  const slots = [undefined, undefined], messages = [], jobs = new Map();
  const container = {
    size: slots.length,
    firstEmptySlot: () => { const i = slots.indexOf(undefined); return i < 0 ? undefined : i; },
    getItem: (i) => slots[i],
    setItem(i, item) { slots[i] = item; }
  };
  const player = {
    id: "p1", isValid: true, mode: "Survival", dimension,
    getGameMode() { return this.mode; },
    getComponent() { return { container }; }
  };
  const dependencies = {
    world, system, ItemStack, BlockPermutation: { resolve: (id) => ({ id }) }, jobs,
    notify: (_, message) => messages.push(message),
    rankFromCount: (count) => count >= 25 ? 5 : count >= 15 ? 4 : count >= 8 ? 3 : count >= 3 ? 2 : 1,
    rankName: (rank) => `rank-${rank}`
  };
  const api = context.create(dependencies);
  const at = (x) => dimension.getBlock({ x, y: 1, z: 0 });
  function place(x, item = new ItemStack("nonax:architect_workbench"), capture = true) {
    const clicked = dimension.getBlock({ x, y: 0, z: 0 });
    const before = { player, block: clicked, blockFace: "Up", itemStack: item };
    if (capture) api.capturePlacement(before);
    if (before.cancel) return before;
    const block = at(x);
    block.typeId = "nonax:architect_workbench";
    api.placed({ player, block });
    if (legacy && properties.has("nonax:workbench_ledger")) {
      const state = JSON.parse(properties.get("nonax:workbench_ledger"));
      for (const record of Object.values(state.records)) record.initialCarpenter = false;
      properties.set("nonax:workbench_ledger", JSON.stringify(state));
    }
    return before;
  }
  function recover(x) {
    const event = { player, block: at(x) };
    api.beforeBreak(event);
    assert.equal(event.cancel, true);
    while (scheduled.length) scheduled.shift()();
  }
  const data = () => JSON.parse(properties.get("nonax:workbench_ledger"));
  return { api, world, player, dimension, slots, actors, jobs, messages, system, at, place, recover, data, ItemStack, restart: () => context.create(dependencies) };
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const architect = [...f.actors.values()].find((actor) => actor.typeId === "nonax:architect");
  const carpenter = [...f.actors.values()].find((actor) => actor.typeId === "nonax:carpenter");
  assert.deepEqual(Array.from(f.api.loadedCarpenters(architect)), [carpenter]);
  carpenter.setDynamicProperty("nonax:celebrating", true);
  const job = { phase: "celebrating", architect, celebratingCarpenters: [carpenter] };
  f.jobs.set("job", job);
  f.api.carpenterLoaded(carpenter);
  assert.equal(carpenter.getDynamicProperty("nonax:celebrating"), true);
  const restartedDuringCelebration = f.restart();
  const eventCount = carpenter.events.length;
  restartedDuringCelebration.reconcileFollow();
  assert.deepEqual(carpenter.events.slice(eventCount), ["nonax:follow_1"]);
  assert.equal(carpenter.getDynamicProperty("nonax:celebrating"), true);
  f.jobs.clear();
  f.restart().carpenterLoaded(carpenter);
  assert.equal(carpenter.getDynamicProperty("nonax:celebrating"), undefined);
  assert(carpenter.events.includes("nonax:stop_celebrating"));
  architect.setDynamicProperty("nonax:celebrating", true);
  f.restart().loaded(architect);
  assert.equal(architect.getDynamicProperty("nonax:celebrating"), undefined);
  assert(architect.events.includes("nonax:stop_work"));
  f.actors.delete(carpenter.id);
  assert.equal(f.api.loadedCarpenters(architect).length, 0);
  assert.equal(f.data().records["workbench-1"].carpenterIds.length, 1);
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const record = f.data().records["workbench-1"];
  const carpenter = f.actors.get(record.carpenterIds[0]);
  const position = { dimension: f.dimension.id, x: 8.5, y: 1, z: 8.5 };
  const floor = f.dimension.getBlock({ x: 8, y: 0, z: 8 });
  floor.typeId = "minecraft:stone";
  carpenter.setDynamicProperty("nonax:carpenter_recovery", JSON.stringify(position));
  carpenter.teleport = (p) => { carpenter.location = p; };
  f.jobs.set("job", { carpenters: [carpenter] });
  const start = carpenter.events.length;
  f.api.suspendCarpenter(carpenter.id);
  f.api.reconcileFollow();
  assert.equal(carpenter.events.length, start);
  f.jobs.clear();
  f.api.carpenterLoaded(carpenter);
  assert.equal(carpenter.getDynamicProperty("nonax:carpenter_recovery"), undefined);
  assert.equal(carpenter.location.x, 8.5);
  f.api.reconcileFollow();
  assert(carpenter.events.includes("nonax:follow_1"));
  carpenter.setDynamicProperty("nonax:carpenter_recovery", JSON.stringify(position));
  floor.typeId = "minecraft:lava";
  const previous = carpenter.location;
  f.api.carpenterLoaded(carpenter);
  assert.equal(carpenter.location, previous);
  assert(carpenter.getDynamicProperty("nonax:carpenter_recovery"));
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const record = f.data().records["workbench-1"];
  const architect = f.actors.get(record.architectId);
  const carpenter = f.actors.get(record.carpenterIds[0]);
  const job = { architect, carpenters: [carpenter], celebratingCarpenters: [carpenter], phase: "celebrating" };
  f.api.suspendCarpenter(carpenter.id);
  f.jobs.set("job", job);
  const events = carpenter.events.length;
  f.api.reconcileFollow();
  assert.equal(carpenter.events.length, events);
  f.jobs.delete("job");
  f.api.reconcileFollow();
  assert.deepEqual(carpenter.events.slice(events), ["nonax:follow_1"]);
}

{
  const f = fixture();
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  let actor = [...f.actors.values()][0];
  assert(f.api.isActive(actor));
  assert.equal(f.actors.size, 1);
  assert.equal(f.api.credit(actor), 1);
  assert.equal(f.api.credit(actor), 2);
  assert.equal(f.api.credit(actor), 3);
  f.jobs.set("job", { architect: actor });
  f.recover(1);
  assert.equal(f.at(1).typeId, "nonax:architect_workbench");
  assert.equal(f.slots[0], undefined);
  f.jobs.clear();
  f.recover(1);
  assert.equal(f.at(1).typeId, "minecraft:air");
  assert.equal(actor.isValid, false);
  assert.equal(f.data().records["workbench-1"].state, "carried");
  const item = f.slots[0];
  assert.equal(item.getDynamicProperty("nonax:workbench_id"), "workbench-1");
  f.place(2, item);
  assert.equal(f.data().records["workbench-1"].state, "placed");
  f.api.summon(f.player, f.at(2).location, f.dimension);
  actor = [...f.actors.values()][0];
  assert.equal(actor.getDynamicProperty("nonax:build_count"), 3);
  assert.equal(actor.getDynamicProperty("nonax:rank"), 2);
  assert.equal(f.place(3, item).cancel, true);
  assert.equal(f.at(3).typeId, "minecraft:air");
  f.api.summon(f.player, f.at(3).location, f.dimension);
  assert.equal(f.actors.size, 1);
  assert(f.messages.some((m) => m.includes("状態を確認できません")));
}

{
  const f = fixture();
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const old = [...f.actors.values()][0];
  f.actors.delete(old.id);
  f.recover(1);
  assert.equal(old.isValid, true);
  f.place(2, f.slots[0]);
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal(f.api.isActive(old), false);
  f.api.loaded(old);
  assert.equal(old.isValid, false);
  assert.equal(f.actors.size, 1);
}

{
  const f = fixture();
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  f.slots.fill(new f.ItemStack("minecraft:stone"));
  f.recover(1);
  assert.equal(f.at(1).typeId, "nonax:architect_workbench");
  assert.equal(f.data().records["workbench-1"].state, "placed");
  f.player.mode = "Creative";
  f.recover(1);
  assert.equal(f.actors.size, 0);
  assert.equal(f.data().records["workbench-1"].state, "revoked");
  f.place(2);
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal([...f.actors.values()][0].getDynamicProperty("nonax:rank"), 1);
}

{
  const f = fixture();
  f.place(1, undefined, false);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(f.actors.size, 0);
  f.place(2);
  f.world.failSave = true;
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal(f.actors.size, 0);
  f.world.failSave = false;
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal(f.actors.size, 1);
}

{
  const f = fixture();
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  f.player.getComponent().container.setItem = () => { throw new Error("inventory write failed"); };
  f.recover(1);
  assert.equal(f.data().records["workbench-1"].state, "recovering");
  assert.equal(f.slots[0], undefined);
  assert.equal(f.at(1).typeId, "minecraft:air");
  f.place(2, new f.ItemStack("nonax:architect_workbench"));
  assert.equal(f.data().records["workbench-2"].state, "placed");
}

{
  const f = fixture();
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const save = f.world.setDynamicProperty;
  let saves = 0;
  f.world.setDynamicProperty = function (...args) {
    if (++saves === 3) throw new Error("final save failed");
    return save.apply(this, args);
  };
  f.recover(1);
  assert.equal(f.data().records["workbench-1"].state, "recovering");
  assert(f.slots[0]);
  f.world.setDynamicProperty = save;
  f.api.recoverPending(f.player);
  assert.equal(f.data().records["workbench-1"].state, "carried");
  f.place(2, f.slots[0]);
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal(f.actors.size, 1);
}

{
  const f = fixture();
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const actor = [...f.actors.values()][0];
  const events = actor.events.length;
  f.api.loaded(actor);
  assert.equal(actor.events.length, events);
  f.recover(1);
  f.player.mode = "Creative";
  assert.equal(f.place(2, f.slots[0]).cancel, true);
  assert.equal(f.data().records["workbench-1"].state, "carried");
}

{
  const f = fixture();
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  f.player.getComponent().container.setItem = () => { throw new Error("inventory write failed"); };
  f.recover(1);
  f.api.recoverPending(f.player);
  assert.equal(f.data().records["workbench-1"].state, "recovering");
  assert(f.messages.some((m) => m.includes("回収が中断")));
}

{
  const f = fixture();
  f.world.setDynamicProperty("nonax:workbench_ledger", "broken json");
  assert.equal(f.place(1).cancel, true);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(f.actors.size, 0);
  assert(f.messages.some((m) => m.includes("状態を確認できません")));
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const architect = [...f.actors.values()].find((actor) => actor.typeId === "nonax:architect");
  const first = [...f.actors.values()].find((actor) => actor.typeId === "nonax:carpenter");
  assert(architect && first);
  assert.equal(first.nameTag, "見習いの大工");
  const record = () => f.data().records["workbench-1"];
  assert.deepEqual(record().carpenterIds, [first.id]);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(f.actors.size, 2);
  for (let i = 0; i < 3; i++) f.api.credit(architect, f.player);
  assert.equal(first.getDynamicProperty("nonax:rank"), 2);
  assert.equal(first.nameTag, "一人前の大工");
  f.actors.delete(first.id);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.deepEqual(record().carpenterIds, [first.id]);
  assert(f.messages.some((message) => message.includes("未読み込み")));
  for (let i = 3; i < 8; i++) f.api.credit(architect, f.player);
  assert.equal(first.getDynamicProperty("nonax:rank"), 2);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(record().carpenterIds.length, 2);
  const secondId = record().carpenterIds[1];
  assert.equal(f.actors.get(secondId).nameTag, "熟練の大工");
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(record().carpenterIds.length, 2);
  f.api.carpenterLoaded(first);
  assert.equal(first.nameTag, "熟練の大工");
  f.api.carpenterDeath(f.actors.get(secondId));
  f.actors.delete(secondId);
  assert.deepEqual(record().carpenterIds, [first.id]);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(record().carpenterIds.length, 2);
  const replacementId = record().carpenterIds[1];
  f.recover(1);
  assert.equal(f.actors.size, 0);
  assert(record().retiredCarpenterIds.includes(first.id));
  assert(record().retiredCarpenterIds.includes(replacementId));
  assert.equal(first.isValid, true);
  f.place(2, f.slots[0]);
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal(f.actors.size, 1);
  f.api.carpenterLoaded(first);
  assert.equal(first.isValid, false);
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal(record().carpenterIds.length, 1);
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal(record().carpenterIds.length, 2);
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const actor = [...f.actors.values()].find((a) => a.typeId === "nonax:carpenter");
  f.world.failSave = true;
  f.api.carpenterDeath(actor);
  assert.equal(f.data().records["workbench-1"].carpenterIds.length, 1);
  assert(f.messages.some((message) => message.includes("死亡を記録できません")));
  f.world.failSave = false;
  f.actors.delete(actor.id);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(f.data().records["workbench-1"].carpenterIds.length, 1);
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const actors = [...f.actors.values()];
  f.player.mode = "Creative";
  f.recover(1);
  assert(actors.every((actor) => !actor.isValid));
  assert.equal(f.data().records["workbench-1"].state, "revoked");
}

{
  const f = fixture(false);
  f.place(1);
  f.place(10);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  f.api.summon(f.player, f.at(10).location, f.dimension);
  const record = (id) => f.data().records[id];
  const architect = f.actors.get(record("workbench-1").architectId);
  const otherCarpenter = f.actors.get(record("workbench-2").carpenterIds[0]);
  for (let i = 0; i < 15; i++) f.api.credit(architect, f.player);
  assert.equal(f.actors.get(record("workbench-1").carpenterIds[0]).nameTag, "名人の大工");
  assert.equal(otherCarpenter.nameTag, "見習いの大工");
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(record("workbench-1").carpenterIds.length, 2);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(record("workbench-1").carpenterIds.length, 3);
  for (let i = 15; i < 25; i++) f.api.credit(architect, f.player);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(record("workbench-1").carpenterIds.length, 4);
  assert(record("workbench-1").carpenterIds.every((id) => f.actors.get(id).nameTag === "達人の大工"));
  f.recover(1);
  assert(otherCarpenter.isValid);
  assert.equal(record("workbench-2").carpenterIds.length, 1);
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const record = f.data().records["workbench-1"];
  const actor = f.actors.get(record.carpenterIds[0]);
  const architect = f.actors.get(record.architectId);
  f.api.carpenterDeath(actor);
  f.actors.delete(actor.id);
  f.world.failSave = true;
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(f.actors.size, 1);
  assert.equal(f.data().records["workbench-1"].carpenterIds.length, 0);
  assert(architect.isValid);
  f.world.failSave = false;
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert.equal(f.data().records["workbench-1"].carpenterIds.length, 1);
}

{
  const f = fixture(false);
  f.place(1);
  f.place(10);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  f.api.summon(f.player, f.at(10).location, f.dimension);
  let data = f.data();
  const a = data.records["workbench-1"], b = data.records["workbench-2"];
  assert.equal(a.followSlot, 1);
  assert.equal(b.followSlot, 2);
  const leader1 = f.actors.get(a.architectId), leader2 = f.actors.get(b.architectId);
  const worker1 = f.actors.get(a.carpenterIds[0]), worker2 = f.actors.get(b.carpenterIds[0]);
  assert(leader1.hasTag("nonax_follow_v2_1"));
  assert(!leader2.hasTag("nonax_follow_v2_1"));
  assert(leader2.hasTag("nonax_follow_v2_2"));
  assert(worker1.events.includes("nonax:follow_1"));
  assert(worker2.events.includes("nonax:follow_2"));
  const events = worker1.events.length;
  f.api.reconcileFollow();
  assert.equal(worker1.events.length, events);
  const restarted = f.restart();
  restarted.reconcileFollow();
  assert.deepEqual(worker1.events.slice(events), ["nonax:follow_1"]);
  assert.equal(f.data().followVersion, 2);
  f.actors.delete(leader1.id);
  f.api.reconcileFollow();
  assert.equal(f.data().records["workbench-1"].followSlot, 1);
  f.recover(1);
  assert(leader1.isValid);
  f.place(3, f.slots[0]);
  f.api.summon(f.player, f.at(3).location, f.dimension);
  f.api.summon(f.player, f.at(3).location, f.dimension);
  data = f.data();
  const replacement = data.records["workbench-1"];
  assert.equal(replacement.followSlot, 3);
  assert(leader1.hasTag("nonax_follow_v2_1"));
  assert(!leader1.hasTag("nonax_follow_v2_3"));
  assert(f.actors.get(replacement.architectId).hasTag("nonax_follow_v2_3"));
  assert(f.actors.get(replacement.carpenterIds[0]).events.includes("nonax:follow_3"));
  f.api.loaded(leader1);
  assert(!leader1.isValid);
  assert.equal(f.data().followReservations.length, 0);
}

{
  const f = fixture(false);
  f.player.mode = "Creative";
  for (let i = 1; i <= 30; i++) {
    f.place(i);
    f.api.summon(f.player, f.at(i).location, f.dimension);
    assert.equal(f.data().records[`workbench-${i}`].followSlot, 1);
    f.recover(i);
  }
  assert.equal(f.data().followReservations.length, 0);
}

{
  const f = fixture(false);
  f.place(1);
  for (let i = 0; i < 30; i++) {
    f.api.summon(f.player, f.at(1).location, f.dimension);
    if (i > 0) f.api.summon(f.player, f.at(1).location, f.dimension);
    assert.equal(f.data().records["workbench-1"].followSlot, 1);
    f.recover(1);
    const item = f.slots[0];
    f.slots[0] = undefined;
    f.place(1, item);
  }
  assert.equal(f.data().records["workbench-1"].state, "placed");
  assert.equal(f.data().followReservations.length, 0);
}

{
  const f = fixture(false);
  for (let i = 1; i <= 20; i++) {
    f.place(i);
    f.api.summon(f.player, f.at(i).location, f.dimension);
    assert.equal(f.data().records[`workbench-${i}`].followSlot, i);
  }
  f.place(21);
  f.api.summon(f.player, f.at(21).location, f.dimension);
  const record = f.data().records["workbench-21"];
  assert.equal(record.followSlot, undefined);
  assert.equal(record.carpenterIds.length, 1);
  assert(f.messages.some((message) => message.includes("最大20枠")));
  assert(!f.actors.get(record.carpenterIds[0]).events.some((event) => event.startsWith("nonax:follow_")));
  f.player.mode = "Creative";
  f.recover(1);
  f.api.reconcileFollow();
  assert.equal(f.data().records["workbench-21"].followSlot, 1);
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const record = f.data().records["workbench-1"];
  const architect = f.actors.get(record.architectId);
  const worker = f.actors.get(record.carpenterIds[0]);
  f.actors.delete(architect.id);
  f.actors.delete(worker.id);
  f.recover(1);
  assert.equal(f.data().followReservations[0].ids.length, 2);
  f.place(2);
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal(f.data().records["workbench-2"].followSlot, 2);
  f.api.loaded(architect);
  assert.deepEqual(f.data().followReservations[0].ids, [worker.id]);
  f.place(3);
  f.api.summon(f.player, f.at(3).location, f.dimension);
  assert.equal(f.data().records["workbench-3"].followSlot, 3);
  f.restart().carpenterLoaded(worker);
  assert.equal(f.data().followReservations.length, 0);
  f.place(4);
  f.api.summon(f.player, f.at(4).location, f.dimension);
  assert.equal(f.data().records["workbench-4"].followSlot, 1);
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const data = f.data();
  const leader = f.actors.get(data.records["workbench-1"].architectId);
  const worker = f.actors.get(data.records["workbench-1"].carpenterIds[0]);
  delete data.followVersion;
  delete data.followReservations;
  data.nextFollowSlot = 21;
  data.records["workbench-1"].followSlot = 19;
  leader.addTag("nonax_follow_19");
  f.world.setDynamicProperty("nonax:workbench_ledger", JSON.stringify(data));
  f.restart().reconcileFollow();
  assert.equal(f.data().followVersion, 2);
  assert.equal(f.data().records["workbench-1"].followSlot, 1);
  assert(leader.hasTag("nonax_follow_v2_1"));
  assert(worker.events.includes("nonax:follow_1"));
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const data = f.data();
  const leader = f.actors.get(data.records["workbench-1"].architectId);
  leader.remove = () => { throw new Error("removal failed"); };
  f.recover(1);
  assert.equal(f.data().records["workbench-1"].state, "recovering");
  assert.equal(f.data().followReservations[0].slot, 1);
  f.place(2);
  f.api.summon(f.player, f.at(2).location, f.dimension);
  assert.equal(f.data().records["workbench-2"].followSlot, 2);
}

{
  const f = fixture(false);
  f.place(1);
  f.api.summon(f.player, f.at(1).location, f.dimension);
  const data = f.data();
  data.followReservations = [{ slot: data.records["workbench-1"].followSlot, ids: ["other"] }];
  f.world.setDynamicProperty("nonax:workbench_ledger", JSON.stringify(data));
  f.api.summon(f.player, f.at(1).location, f.dimension);
  assert(f.messages.some((message) => message.includes("状態を確認できません")));
}

console.log("Workbench service tests passed");
