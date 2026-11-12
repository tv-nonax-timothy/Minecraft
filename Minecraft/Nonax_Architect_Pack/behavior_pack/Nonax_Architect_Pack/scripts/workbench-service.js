import { createWorkbenchRecord, validateWorkbenchRecord, bindArchitect, bindCarpenter, carpenterDied, recordBuildCount, beginRecovery, finishRecovery, placeRecoveredWorkbench } from "./workbench-ledger.js";

const LEDGER = "nonax:workbench_ledger";
const WORKBENCH_ID = "nonax:workbench_id";
const BENCH = "nonax:architect_workbench";
const ARCHITECT = "nonax:architect";
const CARPENTER = "nonax:carpenter";
const RANK = "nonax:rank";
const CARPENTER_TITLES = ["見習い", "一人前", "熟練", "名人", "達人"];
const CARPENTER_LIMITS = [1, 1, 2, 3, 4];
const FOLLOW_LIMIT = 20;
const CELEBRATING = "nonax:celebrating";
const CARPENTER_RECOVERY = "nonax:carpenter_recovery";
const LOG = "[nonax:workbench]";
const OFFSETS = {
  North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0],
  West: [-1, 0, 0], Up: [0, 1, 0], Down: [0, -1, 0]
};

function isSafeCarpenterFloor(id) {
  const name = id.startsWith("minecraft:") ? id.slice(10) : "";
  return /^(grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|stone|granite|diorite|andesite|deepslate|cobblestone|cobbled_deepslate|clay|mud|packed_mud|snow_block|terracotta|sandstone|red_sandstone|[^:]+_planks|[^:]+_concrete|[^:]+_terracotta)$/.test(name);
}

export function createWorkbenchService({ world, system, ItemStack, BlockPermutation, jobs, notify, rankFromCount, rankName }) {
  const pending = new Map();
  const locked = new Set();
  const following = new Map();
  const followWarnings = new Set();
  const recoveryWarnings = new Set();

  function read() {
    const raw = world.getDynamicProperty(LEDGER);
    if (raw === undefined) return { version: 1, nextId: 1, records: {} };
    if (typeof raw !== "string") throw new Error("ledger is not a string");
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Number.isSafeInteger(data.nextId) || data.nextId < 1 ||
        !data.records || typeof data.records !== "object" || Array.isArray(data.records)) {
      throw new Error("invalid ledger");
    }
    if (data.nextFollowSlot !== undefined &&
        (!Number.isInteger(data.nextFollowSlot) || data.nextFollowSlot < 1 || data.nextFollowSlot > FOLLOW_LIMIT + 1)) {
      throw new Error("invalid next follow slot");
    }
    if (data.followVersion !== undefined && data.followVersion !== 2) throw new Error("invalid follow version");
    if (data.followVersion === 2 && !Array.isArray(data.followReservations)) throw new Error("invalid follow reservations");
    const positions = new Set(), activeActors = new Set(), followSlots = new Set(), reservedActors = new Set();
    if (data.followVersion === 2) {
      for (const reservation of data.followReservations) {
        if (!reservation || !Number.isInteger(reservation.slot) || reservation.slot < 1 ||
            reservation.slot > FOLLOW_LIMIT || followSlots.has(reservation.slot) ||
            !Array.isArray(reservation.ids) || !reservation.ids.length) throw new Error("invalid follow reservation");
        followSlots.add(reservation.slot);
        for (const id of reservation.ids) {
          if (typeof id !== "string" || !id || reservedActors.has(id)) throw new Error("invalid reserved entity");
          reservedActors.add(id);
        }
      }
    }
    for (const [id, record] of Object.entries(data.records)) {
      validateWorkbenchRecord(record);
      if (id !== record.id) throw new Error("ledger id mismatch");
      if (record.followSlot !== undefined) {
        if (followSlots.has(record.followSlot) ||
            (data.followVersion !== 2 && record.followSlot >= (data.nextFollowSlot ?? 1))) {
          throw new Error("duplicate or unallocated follow slot");
        }
        followSlots.add(record.followSlot);
      }
      if (record.position) {
        const location = key(record.position);
        if (positions.has(location)) throw new Error("duplicate workbench position");
        positions.add(location);
      }
      if (record.architectId) {
        if (activeActors.has(record.architectId) || reservedActors.has(record.architectId)) throw new Error("duplicate active architect");
        activeActors.add(record.architectId);
      }
      for (const actorId of record.carpenterIds ?? []) {
        if (activeActors.has(actorId) || reservedActors.has(actorId)) throw new Error("duplicate active entity");
        activeActors.add(actorId);
      }
    }
    return data;
  }

  function save(data) {
    world.setDynamicProperty(LEDGER, JSON.stringify(data));
  }

  function upgradeFollow(data) {
    if (data.followVersion === 2) return;
    for (const record of Object.values(data.records)) delete record.followSlot;
    data.followVersion = 2;
    data.followReservations = [];
    delete data.nextFollowSlot;
    save(data);
    console.warn(`${LOG} follow slots upgraded to reusable v2 tags`);
  }

  function removeRetired(data, actor) {
    const actorId = actor.id;
    actor.remove();
    const reservation = data.followReservations?.find((entry) => entry.ids.includes(actorId));
    if (!reservation) return;
    reservation.ids = reservation.ids.filter((id) => id !== actorId);
    if (!reservation.ids.length) {
      data.followReservations = data.followReservations.filter((entry) => entry !== reservation);
      console.warn(`${LOG} follow slot released: slot=${reservation.slot}`);
    }
    save(data);
  }

  function position(block) {
    const { x, y, z } = block.location;
    return { dimension: block.dimension.id, x, y, z };
  }

  function key(pos) {
    return `${pos.dimension}:${pos.x},${pos.y},${pos.z}`;
  }

  function recordAt(data, pos) {
    const found = Object.values(data.records).filter((record) =>
      record.position && key(record.position) === key(pos));
    if (found.length > 1) throw new Error("duplicate workbench position");
    return found[0];
  }

  function fail(player, operation, error) {
    console.warn(`${LOG} ${operation}: ${error}`);
    if (player) notify(player, "§c作業台の状態を確認できません。操作を中止しました。Content Log を確認してください。");
  }

  function capturePlacement(event) {
    const { player, block, itemStack, blockFace } = event;
    if (!player || !block || itemStack?.typeId !== BENCH || event.isFirstEvent === false) return;
    pending.delete(player.id);
    try {
      const id = itemStack.getDynamicProperty(WORKBENCH_ID);
      if (id !== undefined && (typeof id !== "string" || !id)) throw new Error("invalid item workbench id");
      if (id && player.getGameMode() !== "Survival") {
        event.cancel = true;
        notify(player, "§c回収した作業台はサバイバルで設置してください。");
        return;
      }
      const data = read();
      if (id && data.records[id]?.state !== "carried") {
        event.cancel = true;
        throw new Error("carried workbench is not available");
      }
      const offset = OFFSETS[blockFace];
      if (!offset) throw new Error(`unknown block face: ${blockFace}`);
      const p = position(block);
      pending.set(player.id, {
        tick: system.currentTick, id, dimension: p.dimension,
        positions: [key(p), key({ ...p, x: p.x + offset[0], y: p.y + offset[1], z: p.z + offset[2] })]
      });
    } catch (error) {
      event.cancel = true;
      fail(player, "capture placement failed", error);
    }
  }

  function placed(event) {
    if (event.block.typeId !== BENCH) return;
    const { player, block } = event;
    const captured = pending.get(player.id);
    pending.delete(player.id);
    try {
      const pos = position(block);
      if (!captured || system.currentTick - captured.tick < 0 || system.currentTick - captured.tick > 1 ||
          captured.dimension !== pos.dimension || !captured.positions.includes(key(pos))) {
        throw new Error(`placement could not be matched at ${key(pos)}`);
      }
      const data = read();
      if (recordAt(data, pos)) throw new Error("position already registered");
      let record;
      if (captured.id) {
        record = data.records[captured.id];
        if (!record) throw new Error("unknown carried workbench");
        record = placeRecoveredWorkbench(record, pos);
      } else {
        const id = `workbench-${data.nextId++}`;
        if (data.records[id]) throw new Error("workbench id collision");
        record = createWorkbenchRecord(id, pos);
      }
      data.records[record.id] = record;
      save(data);
      console.warn(`${LOG} placed: id=${record.id} pos=${key(pos)} restored=${Boolean(captured.id)}`);
    } catch (error) {
      fail(player, "placement registration failed", error);
    }
  }

  function syncArchitect(actor, record) {
    const rank = rankFromCount(record.buildCount);
    if (actor.getDynamicProperty("nonax:build_count") !== record.buildCount) {
      actor.setDynamicProperty("nonax:build_count", record.buildCount);
    }
    if (actor.getDynamicProperty("nonax:rank") !== rank) {
      actor.triggerEvent(`nonax:set_rank_${rank}`);
      actor.setDynamicProperty("nonax:rank", rank);
    }
    if (actor.nameTag !== rankName(rank)) actor.nameTag = rankName(rank);
  }

  function isActive(actor) {
    const id = actor.getDynamicProperty(WORKBENCH_ID);
    if (typeof id !== "string" || !id) return false;
    const record = read().records[id];
    return Boolean(record && record.state === "placed" && record.architectId === actor.id);
  }

  function loadedCarpenters(architect) {
    const id = architect.getDynamicProperty(WORKBENCH_ID);
    const record = read().records[id];
    if (!record || record.state !== "placed" || record.architectId !== architect.id) {
      throw new Error("architect does not match ledger");
    }
    const result = [];
    for (const actorId of record.carpenterIds ?? []) {
      const actor = world.getEntity(actorId);
      if (!actor?.isValid) continue;
      if (actor.typeId !== CARPENTER || actor.getDynamicProperty(WORKBENCH_ID) !== id) {
        throw new Error(`carpenter does not match ledger: ${actorId}`);
      }
      result.push(actor);
    }
    return result;
  }

  function restoreCelebration(actor, event) {
    if (!actor.getDynamicProperty(CELEBRATING)) return;
    if ([...jobs.values()].some((job) => job.phase === "celebrating" &&
        (job.architect?.id === actor.id || job.celebratingCarpenters?.some((entry) => entry.id === actor.id)))) return;
    actor.triggerEvent(event);
    actor.setDynamicProperty(CELEBRATING, undefined);
  }

  function carpenterBusy(id) {
    return [...jobs.values()].some((job) => job.carpenters?.some((actor) => actor.id === id));
  }

  function suspendCarpenter(id) {
    following.delete(id);
  }

  function restoreCarpenter(actor) {
    const raw = actor.getDynamicProperty(CARPENTER_RECOVERY);
    if (raw === undefined || carpenterBusy(actor.id)) return;
    try {
      const target = JSON.parse(raw);
      if (!target || typeof target.dimension !== "string" ||
          ![target.x, target.y, target.z].every(Number.isFinite)) throw new Error("invalid carpenter recovery target");
      const dimension = world.getDimension(target.dimension);
      const x = Math.floor(target.x), y = Math.floor(target.y), z = Math.floor(target.z);
      const floor = dimension.getBlock({ x, y: y - 1, z });
      const feet = dimension.getBlock({ x, y, z });
      const head = dimension.getBlock({ x, y: y + 1, z });
      if (!floor || !isSafeCarpenterFloor(floor.typeId) || !feet?.isAir || !head?.isAir) {
        throw new Error(`carpenter recovery position is unavailable: ${x},${y},${z}`);
      }
      actor.teleport({ x: target.x, y: target.y, z: target.z }, { dimension });
      actor.triggerEvent("nonax:stop_celebrating");
      actor.setDynamicProperty(CARPENTER_RECOVERY, undefined);
      following.delete(actor.id);
      recoveryWarnings.delete(actor.id);
      console.warn(`${LOG} carpenter recovered: actor=${actor.id}`);
    } catch (error) {
      if (!recoveryWarnings.has(actor.id)) {
        recoveryWarnings.add(actor.id);
        for (const player of world.getAllPlayers()) {
          notify(player, "§c大工の退避先を確認できません。現場を読み込み、Content Log を確認してください。");
        }
      }
      throw error;
    }
  }

  function loaded(actor) {
    try {
      if (!actor || !actor.isValid || actor.typeId !== ARCHITECT) return;
      const id = actor.getDynamicProperty(WORKBENCH_ID);
      const data = read();
      const record = typeof id === "string" ? data.records[id] : undefined;
      if (!record || record.state !== "placed" || record.architectId !== actor.id) {
        removeRetired(data, actor);
        console.warn(`${LOG} removed inactive architect: id=${actor.id}`);
        return;
      }
      syncArchitect(actor, record);
      restoreCelebration(actor, "nonax:stop_work");
    } catch (error) {
      fail(undefined, "architect load reconciliation failed", error);
    }
  }

  function syncCarpenter(actor, record) {
    const rank = rankFromCount(record.buildCount);
    if (actor.getDynamicProperty(RANK) !== rank) {
      actor.triggerEvent(`nonax:set_rank_${rank}`);
      actor.setDynamicProperty(RANK, rank);
    }
    const name = `${CARPENTER_TITLES[rank - 1]}の大工`;
    if (actor.nameTag !== name) actor.nameTag = name;
  }

  function prepareFollow(data, record, player) {
    if (!record.architectId || !(record.carpenterIds ?? []).length) return;
    upgradeFollow(data);
    record = data.records[record.id];
    if (record.followSlot === undefined) {
      const used = new Set(data.followReservations.map((reservation) => reservation.slot));
      for (const entry of Object.values(data.records)) if (entry.followSlot !== undefined) used.add(entry.followSlot);
      const slot = Array.from({ length: FOLLOW_LIMIT }, (_, i) => i + 1).find((candidate) => !used.has(candidate));
      if (slot === undefined) {
        const message = "§c追従枠が満杯です（最大20枠）。撤去待ちの旧個体がいる場合は枠が解放されるまでお待ちください。";
        if (player) notify(player, message);
        if (!followWarnings.has(record.id)) {
          console.warn(`${LOG} carpenter follow slots exhausted: workbench=${record.id}`);
          if (!player) for (const online of world.getAllPlayers()) notify(online, message);
          followWarnings.add(record.id);
        }
        return;
      }
      record = { ...record, followSlot: slot };
      data.records[record.id] = record;
      save(data);
      followWarnings.delete(record.id);
      console.warn(`${LOG} carpenter follow assigned: workbench=${record.id} architect=${record.architectId} slot=${slot}`);
    }
    const architect = world.getEntity(record.architectId);
    if (architect?.isValid) {
      if (architect.typeId !== ARCHITECT || architect.getDynamicProperty(WORKBENCH_ID) !== record.id) {
        throw new Error("follow architect does not match ledger");
      }
      const tag = `nonax_follow_v2_${record.followSlot}`;
      if (!architect.hasTag(tag)) architect.addTag(tag);
    }
    for (const id of record.carpenterIds) {
      const carpenter = world.getEntity(id);
      if (!carpenter?.isValid) {
        following.delete(id);
        continue;
      }
      if (carpenter.typeId !== CARPENTER || carpenter.getDynamicProperty(WORKBENCH_ID) !== record.id) {
        throw new Error("follow carpenter does not match ledger");
      }
      if (carpenterBusy(id)) {
        following.delete(id);
        continue;
      }
      restoreCarpenter(carpenter);
      if (carpenter.getDynamicProperty(CARPENTER_RECOVERY) !== undefined) continue;
      if (following.get(id) !== record.followSlot) {
        const celebrating = [...jobs.values()].some((job) => job.phase === "celebrating" &&
          job.celebratingCarpenters?.some((actor) => actor.id === id));
        if (!celebrating && carpenter.getDynamicProperty(CELEBRATING)) {
          carpenter.triggerEvent("nonax:stop_celebrating");
          carpenter.setDynamicProperty(CELEBRATING, undefined);
        }
        carpenter.triggerEvent(`nonax:follow_${record.followSlot}`);
        following.set(id, record.followSlot);
      }
    }
  }

  function reconcileFollow() {
    try {
      const data = read();
      const active = new Set();
      for (const record of Object.values(data.records)) {
        if (record.state !== "placed" || !record.architectId) continue;
        for (const id of record.carpenterIds ?? []) active.add(id);
        try {
          prepareFollow(data, record);
        } catch (error) {
          console.warn(`${LOG} carpenter follow setup failed: workbench=${record.id} error=${error}`);
        }
      }
      for (const id of following.keys()) if (!active.has(id)) following.delete(id);
    } catch (error) {
      fail(undefined, "carpenter follow reconciliation failed", error);
    }
  }

  function carpenterLoaded(actor) {
    try {
      if (!actor || !actor.isValid || actor.typeId !== CARPENTER) return;
      const id = actor.getDynamicProperty(WORKBENCH_ID);
      const record = typeof id === "string" ? read().records[id] : undefined;
      if (!record || record.state !== "placed" || !(record.carpenterIds ?? []).includes(actor.id)) {
        removeRetired(read(), actor);
        console.warn(`${LOG} removed inactive carpenter: id=${actor.id}`);
        return;
      }
      following.delete(actor.id);
      syncCarpenter(actor, record);
      restoreCarpenter(actor);
      restoreCelebration(actor, "nonax:stop_celebrating");
    } catch (error) {
      fail(undefined, "carpenter load reconciliation failed", error);
    }
  }

  function carpenterDeath(actor) {
    try {
      const actorId = actor.id;
      const data = read();
      const record = Object.values(data.records).find((entry) => (entry.carpenterIds ?? []).includes(actorId));
      if (!record) return;
      data.records[record.id] = carpenterDied(record, actorId);
      save(data);
      console.warn(`${LOG} carpenter died: id=${record.id} actor=${actorId}`);
    } catch (error) {
      fail(undefined, "carpenter death recording failed", error);
      for (const player of world.getAllPlayers()) {
        notify(player, "§c大工の死亡を記録できませんでした。Content Log を確認してください。");
      }
    }
  }

  function summonCarpenter(player, block, data, record) {
    const limit = CARPENTER_LIMITS[rankFromCount(record.buildCount) - 1];
    if ((record.carpenterIds ?? []).length >= limit) {
      notify(player, "§eこの作業台の大工は召喚上限に達しています。未読み込みの大工も人数に含まれます。");
      return;
    }
    const pos = block.location;
    const above = block.dimension.getBlock({ x: pos.x, y: pos.y + 1, z: pos.z });
    const head = block.dimension.getBlock({ x: pos.x, y: pos.y + 2, z: pos.z });
    if (!above?.isAir || !head?.isAir) {
      notify(player, "§c作業台の上に大工を召喚するスペースがありません。");
      return;
    }
    const actor = block.dimension.spawnEntity(CARPENTER, { x: pos.x + 0.5, y: pos.y + 1, z: pos.z + 0.5 });
    try {
      actor.setDynamicProperty(WORKBENCH_ID, record.id);
      syncCarpenter(actor, record);
      data.records[record.id] = bindCarpenter(record, actor.id, limit);
      save(data);
    } catch (error) {
      try { actor.remove(); } catch (removeError) { console.warn(`${LOG} failed to remove unbound carpenter: ${removeError}`); }
      throw error;
    }
    console.warn(`${LOG} carpenter summoned: id=${record.id} architect=${record.architectId} actor=${actor.id} rank=${rankFromCount(record.buildCount)}`);
    notify(player, "§a大工が現れました。");
    try {
      prepareFollow(data, data.records[record.id], player);
    } catch (error) {
      console.warn(`${LOG} carpenter follow setup failed: workbench=${record.id} error=${error}`);
      notify(player, "§c大工の追従を設定できませんでした。Content Log を確認してください。");
    }
  }

  function summon(player, blockPos, dimension) {
    try {
      const block = dimension.getBlock(blockPos);
      if (!player.isValid || !block || block.typeId !== BENCH) throw new Error("workbench is unavailable");
      const data = read();
      const record = recordAt(data, position(block));
      if (!record || record.state !== "placed") throw new Error("workbench is unregistered or locked");
      if (record.architectId) {
        summonCarpenter(player, block, data, record);
        return;
      }
      const above = dimension.getBlock({ x: blockPos.x, y: blockPos.y + 1, z: blockPos.z });
      if (!above || !above.isAir) {
        notify(player, "§c作業台の上にスペースがありません。");
        return;
      }
      const loc = { x: blockPos.x + 0.5, y: blockPos.y + 1, z: blockPos.z + 0.5 };
      const actor = dimension.spawnEntity(ARCHITECT, loc);
      try {
        actor.setDynamicProperty(WORKBENCH_ID, record.id);
        syncArchitect(actor, record);
        data.records[record.id] = bindArchitect(record, actor.id);
        save(data);
      } catch (error) {
        try { actor.remove(); } catch (removeError) { console.warn(`${LOG} failed to remove unbound architect: ${removeError}`); }
        throw error;
      }
      console.warn(`${LOG} summoned: id=${record.id} actor=${actor.id} count=${record.buildCount}`);
      try {
        dimension.playSound("random.levelup", loc, { volume: 0.8, pitch: 1.0 });
        dimension.spawnParticle("minecraft:villager_happy", { x: loc.x, y: loc.y + 1, z: loc.z });
      } catch (error) {
        console.warn(`${LOG} summon effect failed: ${error}`);
      }
      notify(player, "§a棟梁が現れました。");
      if (record.initialCarpenter) {
        try {
          summonCarpenter(player, block, data, data.records[record.id]);
        } catch (error) {
          fail(player, "initial carpenter summon failed; click workbench to retry", error);
        }
      }
    } catch (error) {
      fail(player, "summon failed", error);
    }
  }

  function credit(actor, player) {
    const id = actor.getDynamicProperty(WORKBENCH_ID);
    const data = read();
    const record = data.records[id];
    if (!record) throw new Error("architect has no ledger record");
    const updated = recordBuildCount(record, actor.id, record.buildCount + 1);
    data.records[id] = updated;
    save(data);
    for (const carpenterId of updated.carpenterIds ?? []) {
      try {
        const carpenter = world.getEntity(carpenterId);
        if (carpenter?.isValid) syncCarpenter(carpenter, updated);
      } catch (error) {
        console.warn(`${LOG} carpenter rank update failed: id=${carpenterId} error=${error}`);
        if (player) notify(player, "§c大工のランクを更新できませんでした。再読み込み時に再試行します。Content Log を確認してください。");
      }
    }
    return updated.buildCount;
  }

  function beforeBreak(event) {
    if (event.block.typeId !== BENCH) return;
    event.cancel = true;
    const { player, block } = event;
    const pos = position(block);
    const dimension = block.dimension;
    const lockKey = key(pos);
    if (locked.has(lockKey)) return;
    locked.add(lockKey);
    system.run(() => {
      try {
        const current = dimension.getBlock(pos);
        if (!player.isValid || !current || current.typeId !== BENCH) throw new Error("workbench is unavailable");
        const mode = player.getGameMode();
        if (mode !== "Survival" && mode !== "Creative") throw new Error(`unsupported game mode: ${mode}`);
        const data = read();
        upgradeFollow(data);
        const record = recordAt(data, pos);
        if (!record || record.state !== "placed") throw new Error("workbench is unregistered or locked");
        if ([...jobs.values()].some((job) => job.architect?.id === record.architectId && record.architectId)) {
          notify(player, "§c建築中は作業台を回収できません。");
          return;
        }
        let container, slot, item;
        if (mode === "Survival") {
          container = player.getComponent("minecraft:inventory").container;
          slot = container.firstEmptySlot();
          if (slot === undefined) {
            notify(player, "§cインベントリに空きを作ってください。");
            return;
          }
          item = new ItemStack(BENCH, 1);
          item.setDynamicProperty(WORKBENCH_ID, record.id);
        }
        data.records[record.id] = {
          ...beginRecovery(record), recoveryPlayer: player.id, recoveryMode: mode
        };
        if (record.followSlot !== undefined) {
          data.followReservations.push({
            slot: record.followSlot,
            ids: [record.architectId, ...(record.carpenterIds ?? [])]
          });
        }
        save(data);
        if (record.architectId) {
          const actor = world.getEntity(record.architectId);
          if (actor && actor.isValid) removeRetired(data, actor);
        }
        for (const carpenterId of record.carpenterIds ?? []) {
          const carpenter = world.getEntity(carpenterId);
          if (carpenter?.isValid) removeRetired(data, carpenter);
        }
        current.setPermutation(BlockPermutation.resolve("minecraft:air"));
        if (container) container.setItem(slot, item);
        data.records[record.id] = {
          ...finishRecovery(data.records[record.id], mode === "Creative"),
          recoveryPlayer: undefined, recoveryMode: undefined
        };
        save(data);
        console.warn(`${LOG} recovered: id=${record.id} mode=${mode}`);
        notify(player, mode === "Survival" ? "§a作業台を回収しました。" : "§a作業台と棟梁の紐付けを解除しました。");
      } catch (error) {
        fail(player, "recovery failed; check ledger before retrying", error);
      } finally {
        locked.delete(lockKey);
      }
    });
  }

  function recoverPending(player) {
    try {
      const data = read();
      const records = Object.values(data.records).filter((record) =>
        record.state === "recovering" && record.recoveryPlayer === player.id);
      if (!records.length) return;
      const container = player.getComponent("minecraft:inventory").container;
      for (const record of records) {
        const dim = world.getDimension(record.position.dimension);
        const block = dim.getBlock(record.position);
        if (record.recoveryMode === "Creative" && block?.isAir) {
          data.records[record.id] = {
            ...finishRecovery(record, true), recoveryPlayer: undefined, recoveryMode: undefined
          };
          save(data);
          console.warn(`${LOG} completed interrupted creative removal: id=${record.id}`);
          notify(player, "§a中断された作業台の撤去を復旧しました。");
          continue;
        }
        if (record.recoveryMode !== "Survival") {
          notify(player, `§c作業台 ${record.id} の回収が中断されています。Content Log を確認してください。`);
          continue;
        }
        let matches = 0;
        for (let slot = 0; slot < container.size; slot++) {
          const item = container.getItem(slot);
          if (item?.typeId === BENCH && item.getDynamicProperty(WORKBENCH_ID) === record.id) matches++;
        }
        if (matches === 1 && block?.isAir) {
          data.records[record.id] = {
            ...finishRecovery(record, false), recoveryPlayer: undefined, recoveryMode: undefined
          };
          save(data);
          console.warn(`${LOG} completed interrupted recovery: id=${record.id}`);
          notify(player, "§a中断された作業台の回収を復旧しました。");
        } else {
          console.warn(`${LOG} recovery requires investigation: id=${record.id} matching_items=${matches} block=${block?.typeId ?? "unloaded"}`);
          notify(player, `§c作業台 ${record.id} の回収が中断されています。Content Log を確認してください。`);
        }
      }
    } catch (error) {
      fail(player, "recovery reconciliation failed", error);
    }
  }

  function reconcileLoaded() {
    for (const dimensionId of ["overworld", "nether", "the_end"]) {
      try {
        for (const actor of world.getDimension(dimensionId).getEntities({ type: ARCHITECT })) loaded(actor);
        for (const actor of world.getDimension(dimensionId).getEntities({ type: CARPENTER })) carpenterLoaded(actor);
      } catch (error) {
        fail(undefined, `loaded architect scan failed in ${dimensionId}`, error);
      }
    }
  }

  return { capturePlacement, placed, summon, beforeBreak, loaded, carpenterLoaded, carpenterDeath, isActive, loadedCarpenters, isSafeCarpenterFloor, suspendCarpenter, credit, recoverPending, reconcileLoaded, reconcileFollow };
}
