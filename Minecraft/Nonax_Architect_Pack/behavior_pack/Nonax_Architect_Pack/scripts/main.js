import { world, system, BlockPermutation } from "@minecraft/server";
import { BLUEPRINTS, validateBlueprint } from "./blueprints.js";

const LOG = "[nonax:architect]";
const PLACE_INTERVAL_TICKS = 5;
const FACE_OFFSETS = {
  North: { x: 0, y: 0, z: -1 },
  East: { x: 1, y: 0, z: 0 },
  South: { x: 0, y: 0, z: 1 },
  West: { x: -1, y: 0, z: 0 },
  Up: { x: 0, y: 1, z: 0 },
  Down: { x: 0, y: -1, z: 0 }
};

// プレイヤーIDごとの進行中ジョブ
const jobs = new Map();
let timerId = undefined;

function notify(player, message) {
  try {
    player.sendMessage(message);
  } catch (e) {
    console.warn(`${LOG} sendMessage failed: ${e}`);
  }
}

function isNight() {
  try {
    const t = world.getTimeOfDay();
    return t >= 12000 && t < 23000;
  } catch (e) {
    return false;
  }
}

// 設計図の外周 1 ブロック外側に、地面の高さで柵の囲いを作る。夜間は四隅の柵の上にランタンを置く。
// 空気でない座標は仮設物の対象から外し、既存ブロックは上書きしない。
function planTemporaries(dimension, bp, origin) {
  const temp = [];
  const night = isNight();
  const x0 = origin.x - 1, x1 = origin.x + bp.size.x;
  const z0 = origin.z - 1, z1 = origin.z + bp.size.z;
  const y = origin.y;
  const consider = (x, yy, z, id) => {
    const block = dimension.getBlock({ x, y: yy, z });
    if (block && block.isAir) temp.push({ pos: { x, y: yy, z }, id });
  };
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      consider(x, y, z, TEMP_FENCE);
      const isCorner = (x === x0 || x === x1) && (z === z0 || z === z1);
      if (night && isCorner) consider(x, y + 1, z, TEMP_LANTERN);
    }
  }
  planScaffolding(dimension, bp, origin, temp, x0 - 1, x1 + 1, z0 - 1, z1 + 1);
  return temp;
}

// 高さのある建築では、四隅の外側に足場の柱を立てる。柱は建築が各段に達したときに 1 段ずつ伸ばす。
// 足場の根元に支えとなるブロックがない場合や、途中に空気でない座標がある場合は、その柱（段）を作らない。
function planScaffolding(dimension, bp, origin, temp, xa, xb, za, zb) {
  if (bp.size.y < SCAFFOLD_MIN_HEIGHT) return;
  for (const [x, z] of [[xa, za], [xa, zb], [xb, za], [xb, zb]]) {
    const ground = dimension.getBlock({ x, y: origin.y - 1, z });
    if (!ground || ground.isAir || ground.isLiquid) continue;
    for (let layer = 0; layer < bp.size.y; layer++) {
      const pos = { x, y: origin.y + layer, z };
      const block = dimension.getBlock(pos);
      if (!block || !block.isAir) break;
      temp.push({ pos, id: TEMP_SCAFFOLD, layer });
    }
  }
}

function placeScaffolding(job, layer) {
  for (const t of job.temp) {
    if (t.layer === undefined || t.layer > layer || t.tried) continue;
    t.tried = true;
    try {
      const block = job.dimension.getBlock(t.pos);
      if (block && block.isAir) {
        block.setPermutation(BlockPermutation.resolve(t.id));
        t.placed = true;
      }
    } catch (e) {
      console.warn(`${LOG} scaffold place error: ${e}`);
    }
  }
}

function placeTemporaries(job) {
  for (const t of job.temp) {
    if (t.layer !== undefined) continue;
    try {
      const block = job.dimension.getBlock(t.pos);
      if (!block || !block.isAir) {
        t.placed = false;
        continue;
      }
      block.setPermutation(BlockPermutation.resolve(t.id));
      t.placed = true;
    } catch (e) {
      t.placed = false;
      console.warn(`${LOG} temp place error: ${e}`);
    }
  }
}

// 自分が置いた種類のブロックが残っている座標だけを空気に戻す
function removeTemporaries(job) {
  let removed = 0, skipped = 0;
  for (const t of [...job.temp].reverse()) {
    if (!t.placed) continue;
    try {
      const block = job.dimension.getBlock(t.pos);
      if (block && block.typeId === t.id) {
        block.setPermutation(BlockPermutation.resolve("minecraft:air"));
        removed++;
      } else {
        skipped++;
      }
    } catch (e) {
      skipped++;
      console.warn(`${LOG} temp remove error: ${e}`);
    }
  }
  console.warn(`${LOG} temp cleanup: removed=${removed} skipped=${skipped}`);
}

const AIR = "minecraft:air";
const LEVEL_FILL = "minecraft:dirt";
const LEVEL_FILL_DEPTH = 4;
const LEVEL_MAX_OPS = 800;
const LEVEL_OPS_PER_STEP = 4;
const ARRIVE_WAIT_TICKS = 30;
const ARRIVE_NEAR_DISTANCE = 6;

const PLANT_IDS = new Set([
  "short_grass", "tall_grass", "fern", "large_fern", "dead_bush", "vine", "seagrass", "tall_seagrass",
  "sweet_berry_bush", "brown_mushroom", "red_mushroom", "dandelion", "poppy", "blue_orchid", "allium",
  "azure_bluet", "red_tulip", "orange_tulip", "white_tulip", "pink_tulip", "oxeye_daisy", "cornflower",
  "lily_of_the_valley", "torchflower", "sunflower", "lilac", "rose_bush", "peony", "pitcher_plant",
  "wither_rose", "pink_petals", "leaf_litter", "short_dry_grass", "tall_dry_grass", "bush", "firefly_bush",
  "glow_lichen", "hanging_roots", "snow_layer", "sugar_cane", "bamboo", "cactus"
]);
const GROUND_IDS = new Set([
  "dirt", "grass_block", "podzol", "mycelium", "coarse_dirt", "rooted_dirt", "dirt_with_roots", "mud",
  "sand", "red_sand", "gravel", "clay", "stone", "granite", "diorite", "andesite", "deepslate", "tuff",
  "calcite", "sandstone", "red_sandstone", "snow", "powder_snow", "netherrack", "moss_block",
  "grass_path", "dirt_path", "farmland", "suspicious_sand", "suspicious_gravel"
]);

function shortId(typeId) {
  return typeId.startsWith("minecraft:") ? typeId.slice(10) : typeId;
}

// 草花など、設置時に置き換えられる植物（葉は含まない）
function isPlant(typeId) {
  return PLANT_IDS.has(shortId(typeId));
}

// 整地で取り除いてよい自然ブロック。建築ブロックや丸太は対象外。
function isClearable(typeId) {
  const id = shortId(typeId);
  return PLANT_IDS.has(id) || GROUND_IDS.has(id) || id.endsWith("_leaves") || id.endsWith("_sapling") || id.endsWith("_ore");
}

// 建築範囲と外周の柵の範囲を平らにする計画を作る。範囲内は建物の高さまで自然ブロックを撤去し、
// 地面が空洞や植物の場合は土で埋める。整地できないブロックが建築範囲内にあれば error を返す。
function planLeveling(dimension, bp, origin) {
  const ops = [];
  const x0 = origin.x - 1, x1 = origin.x + bp.size.x;
  const z0 = origin.z - 1, z1 = origin.z + bp.size.z;
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const inner = x > x0 && x < x1 && z > z0 && z < z1;
      const height = inner ? bp.size.y : 2;
      for (let dy = height - 1; dy >= 0; dy--) {
        const pos = { x, y: origin.y + dy, z };
        const b = dimension.getBlock(pos);
        if (!b) return { error: "建築範囲が読み込まれていません。" };
        if (b.isAir) continue;
        if (isClearable(b.typeId)) {
          ops.push({ pos, id: AIR });
        } else if (inner) {
          return { error: `整地できないブロックがあります: ${shortId(b.typeId)} (${pos.x}, ${pos.y}, ${pos.z})` };
        }
      }
      const fill = [];
      let supported = false;
      for (let d = 0; d < LEVEL_FILL_DEPTH; d++) {
        const pos = { x, y: origin.y - 1 - d, z };
        const b = dimension.getBlock(pos);
        if (!b) return { error: "建築範囲が読み込まれていません。" };
        if (b.isLiquid) break;
        if (!b.isAir && !isPlant(b.typeId)) { supported = true; break; }
        fill.push({ pos, id: LEVEL_FILL });
      }
      if (supported) {
        ops.push(...fill.reverse());
      } else if (inner) {
        return { error: `地面がなく整地できません (${x}, ${origin.y - 1}, ${z})。` };
      }
    }
  }
  if (ops.length > LEVEL_MAX_OPS) return { error: `整地する範囲が大きすぎます (${ops.length} ブロック)。` };
  return { ops };
}

// 棟梁を現場の脇へ呼び寄せる。到着するまで建築は始まらない。
function summonArchitectToSite(job) {
  const a = job.architect;
  if (!a) {
    job.arriveTick = system.currentTick;
    return;
  }
  try {
    const { origin, bp, dimension } = job;
    const target = { x: origin.x - 2.5, y: origin.y + 0.5, z: origin.z + Math.floor(bp.size.z / 2) + 0.5 };
    const dx = a.location.x - target.x, dz = a.location.z - target.z;
    if (a.dimension.id !== dimension.id || Math.sqrt(dx * dx + dz * dz) > ARRIVE_NEAR_DISTANCE) {
      dimension.spawnParticle("minecraft:basic_smoke_particle", a.location);
      a.teleport(target, {
        dimension,
        facingLocation: { x: origin.x + bp.size.x / 2, y: origin.y + 1, z: origin.z + bp.size.z / 2 }
      });
      dimension.spawnParticle("minecraft:basic_smoke_particle", target);
    }
  } catch (e) {
    console.warn(`${LOG} summonArchitectToSite error: ${e}`);
  }
  setArchitectWorking(a, true);
  job.anchor = { x: a.location.x, y: a.location.y, z: a.location.z };
  job.arriveTick = system.currentTick + ARRIVE_WAIT_TICKS;
}

// 建築中は棟梁を持ち場に留める（押された場合などは元の位置へ戻す）
function holdArchitect(job) {
  const a = job.architect;
  if (!a || !job.anchor) return;
  try {
    if (!a.isValid) return;
    const dx = a.location.x - job.anchor.x, dy = a.location.y - job.anchor.y, dz = a.location.z - job.anchor.z;
    if (dx * dx + dy * dy + dz * dz > 4) a.teleport(job.anchor);
  } catch (e) {
    console.warn(`${LOG} holdArchitect error: ${e}`);
  }
}

// 整地を 1 ステップ分進める。すべて終えたら true を返す。
function stepLeveling(job) {
  for (let i = 0; i < LEVEL_OPS_PER_STEP && job.levelIndex < job.levelOps.length; i++) {
    const op = job.levelOps[job.levelIndex++];
    const b = job.dimension.getBlock(op.pos);
    if (!b) continue;
    if (op.id === AIR) {
      if (b.isAir || !isClearable(b.typeId)) continue;
    } else if (!b.isAir && !isPlant(b.typeId)) {
      continue;
    }
    b.setPermutation(BlockPermutation.resolve(op.id));
    if (i === 0) placeEffect(job.dimension, op.pos);
  }
  return job.levelIndex >= job.levelOps.length;
}

function startJob(player, blueprintId, origin) {
  const bp = BLUEPRINTS[blueprintId];
  const dataError = validateBlueprint(bp);
  if (dataError) {
    console.warn(`${LOG} blueprint invalid (${blueprintId}): ${dataError}`);
    notify(player, `§c設計図が不正です: ${dataError}`);
    return;
  }
  if (jobs.has(player.id)) {
    notify(player, "§e建築中です。完了までお待ちください。");
    return;
  }

  const dimension = player.dimension;
  const queue = [];
  for (const b of bp.blocks) {
    const pos = { x: origin.x + b.x, y: origin.y + b.y, z: origin.z + b.z };
    const target = dimension.getBlock(pos);
    if (!target) {
      notify(player, "§c建築範囲が読み込まれていません。");
      return;
    }
    queue.push({ pos, id: b.id });
  }

  // 建築範囲の自然ブロックは整地で片付ける。建築物など整地できないブロックがあれば開始しない。
  const level = planLeveling(dimension, bp, origin);
  if (level.error) {
    notify(player, `§c${level.error}`);
    return;
  }

  const job = {
    player, dimension, queue, index: 0, nextTick: 0, blueprintId, temp: [], origin, bp,
    phase: "arrive", levelOps: level.ops, levelIndex: 0, arriveTick: 0
  };
  jobs.set(player.id, job);
  job.architect = findNearestArchitect(dimension, queue[0].pos);
  summonArchitectToSite(job);
  console.warn(`${LOG} job start: ${blueprintId} blocks=${queue.length} level=${level.ops.length} architect=${job.architect ? "yes" : "no"} player=${player.name}`);
  notify(player, `§a${bp.name}を使用しました。建築を開始します。`);
  ensureTimer();
}

// 棟梁のランク: 建築完了回数がこの値以上で Lv.2〜Lv.5 (index 0 が Lv.2)
const RANK_THRESHOLDS = [3, 8, 15, 25];
const ARCHITECT_TYPE = "nonax:architect";
const ARCHITECT_SEARCH_RADIUS = 64;
const PROP_BUILD_COUNT = "nonax:build_count";
const PROP_RANK = "nonax:rank";
const TEMP_FENCE = "minecraft:oak_fence";
const TEMP_LANTERN = "minecraft:lantern";
const TEMP_SCAFFOLD = "minecraft:scaffolding";
const SCAFFOLD_MIN_HEIGHT = 5;
const WORKBENCH_TYPE = "nonax:architect_workbench";
const SUMMON_CHECK_RADIUS = 16;

// 作業台の右クリックで棟梁を召喚する。付近に棟梁がいる場合は召喚しない。
function summonArchitect(player, blockPos) {
  try {
    if (!player.isValid) return;
    const dimension = player.dimension;
    const nearby = dimension.getEntities({
      type: ARCHITECT_TYPE,
      location: blockPos,
      maxDistance: SUMMON_CHECK_RADIUS
    });
    if (nearby.length > 0) {
      notify(player, "§e近くに棟梁がいます。");
      return;
    }
    const above = dimension.getBlock({ x: blockPos.x, y: blockPos.y + 1, z: blockPos.z });
    if (!above || !above.isAir) {
      notify(player, "§c作業台の上にスペースがありません。");
      return;
    }
    const spawnLoc = { x: blockPos.x + 0.5, y: blockPos.y + 1, z: blockPos.z + 0.5 };
    dimension.spawnEntity(ARCHITECT_TYPE, spawnLoc);
    dimension.playSound("random.levelup", spawnLoc, { volume: 0.8, pitch: 1.0 });
    dimension.spawnParticle("minecraft:villager_happy", { x: spawnLoc.x, y: spawnLoc.y + 1, z: spawnLoc.z });
    console.warn(`${LOG} architect summoned by ${player.name}`);
    notify(player, "§a棟梁が現れました。");
  } catch (e) {
    console.warn(`${LOG} summonArchitect error: ${e}`);
    notify(player, "§c棟梁を召喚できませんでした。");
  }
}

const RANK_TITLES = ["見習い", "一人前", "熟練", "名人", "達人"];

function rankName(rank) {
  return `${RANK_TITLES[rank - 1] ?? ""}の棟梁`;
}

function rankFromCount(count) {
  let rank = 1;
  for (const t of RANK_THRESHOLDS) if (count >= t) rank++;
  return rank;
}

function findNearestArchitect(dimension, from) {
  const architects = dimension.getEntities({
    type: ARCHITECT_TYPE,
    location: from,
    maxDistance: ARCHITECT_SEARCH_RADIUS
  });
  let nearest;
  let best = Infinity;
  for (const a of architects) {
    const dx = a.location.x - from.x, dy = a.location.y - from.y, dz = a.location.z - from.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) { best = d; nearest = a; }
  }
  return nearest;
}

// 建築中は棟梁を作業状態にする（クライアントの腕を振るアニメーションに使う）
function setArchitectWorking(architect, working) {
  try {
    if (architect && architect.isValid) architect.triggerEvent(working ? "nonax:start_work" : "nonax:stop_work");
  } catch (e) {
    console.warn(`${LOG} setArchitectWorking error: ${e}`);
  }
}

function creditArchitect(job) {
  try {
    const first = job.queue[0].pos;
    const nearest = findNearestArchitect(job.dimension, first);
    if (!nearest) {
      console.warn(`${LOG} no architect within ${ARCHITECT_SEARCH_RADIUS} blocks`);
      return;
    }
    const count = (nearest.getDynamicProperty(PROP_BUILD_COUNT) ?? 0) + 1;
    nearest.setDynamicProperty(PROP_BUILD_COUNT, count);
    const newRank = rankFromCount(count);
    const oldRank = nearest.getDynamicProperty(PROP_RANK) ?? 1;
    console.warn(`${LOG} architect credited: count=${count} rank=${oldRank}->${newRank}`);
    // 昇格前のワールドで作られた棟梁にも名前が付くよう、毎回更新する
    nearest.nameTag = rankName(newRank);
    if (newRank !== oldRank) {
      nearest.triggerEvent(`nonax:set_rank_${newRank}`);
      nearest.setDynamicProperty(PROP_RANK, newRank);
      notify(job.player, `§6棟梁が Lv.${newRank} に昇格しました。`);
      try {
        // 建築完了の演出と重ならないよう、少し遅らせて再生する
        const dim = nearest.dimension;
        const target = nearest;
        system.runTimeout(() => {
          try {
            if (!target.isValid) return;
            const loc = target.location;
            dim.playSound("random.totem", loc, { volume: 1.0, pitch: 1.0 });
            for (let i = 0; i < 3; i++) {
              dim.spawnParticle("minecraft:totem_particle", { x: loc.x, y: loc.y + 0.5 + i * 0.6, z: loc.z });
            }
          } catch (err) {
            console.warn(`${LOG} rank-up effect error: ${err}`);
          }
        }, 40);
      } catch (e) {
        console.warn(`${LOG} rank-up effect error: ${e}`);
      }
    }
  } catch (e) {
    console.warn(`${LOG} creditArchitect error: ${e}`);
  }
}

function centerOf(job) {
  const xs = job.queue.map((q) => q.pos.x), ys = job.queue.map((q) => q.pos.y), zs = job.queue.map((q) => q.pos.z);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5,
    y: Math.max(...ys) + 1.5,
    z: (Math.min(...zs) + Math.max(...zs)) / 2 + 0.5
  };
}

function placeEffect(dimension, pos) {
  try {
    const loc = { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 };
    dimension.playSound("dig.wood", loc, { volume: 0.6, pitch: 1.0 });
    dimension.spawnParticle("minecraft:dust_plume", loc);
  } catch (e) {
    console.warn(`${LOG} placeEffect error: ${e}`);
  }
}

function completeEffect(job) {
  try {
    const loc = centerOf(job);
    job.dimension.playSound("random.levelup", loc, { volume: 1.0, pitch: 1.0 });
    for (let i = 0; i < 8; i++) {
      job.dimension.spawnParticle("minecraft:villager_happy", {
        x: loc.x + (Math.random() - 0.5) * 4,
        y: loc.y + Math.random() * 1.5,
        z: loc.z + (Math.random() - 0.5) * 4
      });
    }
  } catch (e) {
    console.warn(`${LOG} completeEffect error: ${e}`);
  }
}

function finishJob(job, ok, reason) {
  jobs.delete(job.player.id);
  console.warn(`${LOG} job end: ok=${ok} placed=${job.index}/${job.queue.length}${reason ? ` reason=${reason}` : ""}`);
  removeTemporaries(job);
  setArchitectWorking(job.architect, false);
  if (ok) {
    notify(job.player, "§a建築が完了しました。");
    completeEffect(job);
    creditArchitect(job);
  } else {
    notify(job.player, `§c建築を中断しました: ${reason}`);
  }
  if (jobs.size === 0 && timerId !== undefined) {
    system.clearRun(timerId);
    timerId = undefined;
  }
}

function tickJobs() {
  for (const job of [...jobs.values()]) {
    try {
      if (!job.player.isValid) {
        finishJob(job, false, "プレイヤーが退出しました");
        continue;
      }
      holdArchitect(job);
      if (system.currentTick < job.nextTick) continue;
      if (job.phase === "arrive") {
        if (system.currentTick < job.arriveTick) continue;
        job.phase = "level";
      }
      job.nextTick = system.currentTick + PLACE_INTERVAL_TICKS;
      if (job.phase === "level") {
        if (stepLeveling(job)) {
          // 整地後の地面に合わせて囲いや足場を作る
          job.temp = planTemporaries(job.dimension, job.bp, job.origin);
          placeTemporaries(job);
          job.phase = "build";
          notify(job.player, `§a${job.bp.name}の建築を開始します。`);
        }
        continue;
      }

      const step = job.queue[job.index];
      const block = job.dimension.getBlock(step.pos);
      if (!block) {
        finishJob(job, false, "建築範囲が読み込まれていません");
        continue;
      }
      if (!block.isAir) {
        finishJob(job, false, "設置先に別のブロックが置かれました");
        continue;
      }
      block.setPermutation(BlockPermutation.resolve(step.id));
      placeEffect(job.dimension, step.pos);
      placeScaffolding(job, step.pos.y - job.origin.y);
      job.index++;
      if (job.index >= job.queue.length) finishJob(job, true);
    } catch (e) {
      finishJob(job, false, "エラーが発生しました");
      console.warn(`${LOG} tick error: ${e}`);
    }
  }
}

function ensureTimer() {
  if (timerId === undefined) timerId = system.runInterval(tickJobs, 1);
}

try {
  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { player, block, itemStack, blockFace } = event;
    if (!player || !block) return;
    if (block.typeId === WORKBENCH_TYPE) {
      if (event.isFirstEvent === false) return;
      // 作業台は常に棟梁の召喚に使う（手に持ったアイテムの通常操作は行わせない）
      event.cancel = true;
      const pos = { x: block.location.x, y: block.location.y, z: block.location.z };
      system.run(() => summonArchitect(player, pos));
      return;
    }
    if (!itemStack) return;
    if (!BLUEPRINTS[itemStack.typeId]) return;
    if (event.isFirstEvent === false) return;

    // 設計図は通常の操作を行わせない
    event.cancel = true;

    // 草花などをクリックした場合は、その植物の位置から建てる（空中に浮かせない）
    const offset = isPlant(block.typeId) ? { x: 0, y: 0, z: 0 } : (FACE_OFFSETS[blockFace] ?? FACE_OFFSETS.Up);
    const origin = {
      x: block.location.x + offset.x,
      y: block.location.y + offset.y,
      z: block.location.z + offset.z
    };
    const blueprintId = itemStack.typeId;
    system.run(() => {
      try {
        startJob(player, blueprintId, origin);
      } catch (e) {
        console.warn(`${LOG} startJob error: ${e}`);
        notify(player, "§c建築を開始できませんでした。");
      }
    });
  });
  world.afterEvents.entitySpawn.subscribe((event) => {
    try {
      const e = event.entity;
      if (e && e.typeId === ARCHITECT_TYPE && !e.nameTag) e.nameTag = rankName(1);
    } catch (err) {
      console.warn(`${LOG} entitySpawn error: ${err}`);
    }
  });
  console.warn(`${LOG} script loaded`);
} catch (e) {
  console.warn(`${LOG} init failed: ${e}`);
}
