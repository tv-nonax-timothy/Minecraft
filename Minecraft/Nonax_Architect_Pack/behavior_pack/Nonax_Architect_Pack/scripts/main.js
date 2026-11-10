import { world, system, BlockPermutation, StructureSaveMode } from "@minecraft/server";
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
const structureSelections = new Map();
let timerId = undefined;

const STRUCTURE_MAX_AXIS = 64;
const STRUCTURE_MAX_VOLUME = 32768;
const BLUEPRINT_HAMMER_TYPE = "nonax:blueprint_hammer";

function notify(player, message) {
  try {
    player.sendMessage(message);
  } catch (e) {
    console.warn(`${LOG} sendMessage failed: ${e}`);
  }
}

function getStructureNamePart(player) {
  const name = player.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 32);
  if (name) return name;
  let hash = 0;
  for (const char of player.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `player_${hash.toString(36)}`;
}

function nextStructureId(player) {
  const manager = world.structureManager;
  const existing = new Set([...manager.getWorldStructureIds(), ...manager.getPackStructureIds()]);
  const prefix = `nonax:${getStructureNamePart(player)}_`;
  let number = 1;
  while (existing.has(`${prefix}${number}`)) number++;
  return `${prefix}${number}`;
}

function captureSelectedStructure(player, start, end, dimension) {
  const from = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    z: Math.min(start.z, end.z)
  };
  const to = {
    x: Math.max(start.x, end.x),
    y: Math.max(start.y, end.y),
    z: Math.max(start.z, end.z)
  };
  const size = { x: to.x - from.x + 1, y: to.y - from.y + 1, z: to.z - from.z + 1 };
  const volume = size.x * size.y * size.z;
  if (size.x > STRUCTURE_MAX_AXIS || size.y > STRUCTURE_MAX_AXIS || size.z > STRUCTURE_MAX_AXIS) {
    notify(player, `§c範囲の各辺は最大 ${STRUCTURE_MAX_AXIS} ブロックです。`);
    return;
  }
  if (volume > STRUCTURE_MAX_VOLUME) {
    notify(player, `§c範囲が大きすぎます（最大 ${STRUCTURE_MAX_VOLUME} ブロック）。`);
    return;
  }

  let occupied = 0;
  try {
    for (let x = from.x; x <= to.x; x++) {
      for (let y = from.y; y <= to.y; y++) {
        for (let z = from.z; z <= to.z; z++) {
          const block = dimension.getBlock({ x, y, z });
          if (!block) {
            notify(player, "§c選択範囲が読み込まれていません。範囲を読み込んでから選び直してください。");
            return;
          }
          if (!block.isAir) occupied++;
        }
      }
    }
  } catch (e) {
    console.warn(`${LOG} structure validation error: ${e}`);
    notify(player, "§c範囲を検証できませんでした。");
    return;
  }
  if (occupied === 0) {
    notify(player, "§c選択範囲にブロックがありません。");
    return;
  }

  try {
    const id = nextStructureId(player);
    world.structureManager.createFromWorld(id, dimension, from, to, {
      includeBlocks: true,
      includeEntities: false,
      saveMode: StructureSaveMode.World
    });
    console.warn(`${LOG} structure captured: id=${id} size=${size.x}x${size.y}x${size.z} blocks=${occupied}`);
    notify(player, `§a構造をワールドに保存しました: ${id}`);
    notify(player, `§7サイズ ${size.x}x${size.y}x${size.z}、ブロック ${occupied} 個。構造ブロックの保存・エクスポートでファイル名「${id.slice(id.indexOf(":") + 1)}」を指定してください。`);
  } catch (e) {
    console.warn(`${LOG} structure capture failed: ${e}`);
    notify(player, "§c構造の保存に失敗しました。Content Log を確認してください。");
  }
}

function handleBlueprintHammer(player, point, dimension) {
  try {
    if (player.getGameMode() !== "Creative") {
      structureSelections.delete(player.id);
      notify(player, "§c設計ハンマーはクリエイティブでのみ使用できます。");
      return;
    }

    const current = structureSelections.get(player.id);
    if (!current || current.dimension.id !== dimension.id) {
      structureSelections.set(player.id, { point, dimension });
      notify(player, `§e起点を選択しました: ${point.x}, ${point.y}, ${point.z}。終点を選んでください。`);
      return;
    }

    structureSelections.delete(player.id);
    captureSelectedStructure(player, current.point, point, current.dimension);
  } catch (e) {
    structureSelections.delete(player.id);
    console.warn(`${LOG} blueprint hammer error: ${e}`);
    notify(player, "§c設計ハンマーの処理に失敗しました。Content Log を確認してください。");
  }
}

function isDeferredDecoration(id) {
  const name = shortId(id);
  return name === "frame" || name === "glow_frame" ||
    name === "torch" || name.endsWith("_torch") ||
    name === "lantern" || name.endsWith("_lantern") ||
    name === "wooden_door" || name.endsWith("_door") ||
    name === "trapdoor" || name.endsWith("_trapdoor") ||
    name.endsWith("_pressure_plate");
}

function isDoor(id) {
  const name = shortId(id);
  return name === "wooden_door" || name.endsWith("_door");
}

function orderStructureBlocks(blocks) {
  const byPosition = new Map(blocks.map((block) => [`${block.x},${block.y},${block.z}`, block]));
  const ordered = [];
  const pairedUpper = new Set();
  blocks.sort((a, b) => Number(isDeferredDecoration(a.id)) - Number(isDeferredDecoration(b.id)) || a.y - b.y || a.x - b.x || a.z - b.z);
  for (const block of blocks) {
    if (!isDoor(block.id)) {
      ordered.push(block);
      continue;
    }

    const upper = block.states?.upper_block_bit;
    if (upper !== false && upper !== true && upper !== 0 && upper !== 1) {
      return { error: `ドアの上下状態が不正です (${block.x}, ${block.y}, ${block.z})` };
    }
    if (upper === true || upper === 1) {
      if (!pairedUpper.has(block)) return { error: `ドアの下半分がありません (${block.x}, ${block.y}, ${block.z})` };
      continue;
    }
    const other = byPosition.get(`${block.x},${block.y + 1},${block.z}`);
    const otherUpper = other?.states?.upper_block_bit;
    if (!other || other.id !== block.id || (otherUpper !== true && otherUpper !== 1)) {
      return { error: `ドアの上半分がありません (${block.x}, ${block.y}, ${block.z})` };
    }
    pairedUpper.add(other);
    ordered.push(block, other);
  }
  return { blocks: ordered };
}

function loadBlueprint(blueprintId) {
  const definition = BLUEPRINTS[blueprintId];
  if (!definition) return { error: "設計図が見つかりません。" };
  if (!definition.structureSuffix) return { blueprint: definition };

  try {
    const ids = world.structureManager.getPackStructureIds();
    const suffix = definition.structureSuffix.toLowerCase();
    const structureId = ids.find((id) => id.toLowerCase() === suffix || id.toLowerCase().endsWith(`:${suffix}`));
    if (!structureId) {
      console.warn(`${LOG} pack structure not found: suffix=${suffix} ids=${ids.join(",")}`);
      return { error: `構造データがパック内にありません (${suffix})` };
    }

    const structure = world.structureManager.get(structureId);
    if (!structure || !structure.isValid) return { error: `構造データを読み込めません (${structureId})` };
    const size = structure.size;
    const volume = size.x * size.y * size.z;
    if (![size.x, size.y, size.z].every((axis) => Number.isInteger(axis) && axis > 0 && axis <= STRUCTURE_MAX_AXIS)) {
      return { error: `構造データの寸法が不正です (${size.x}x${size.y}x${size.z})` };
    }
    if (volume > STRUCTURE_MAX_VOLUME) return { error: `構造データが大きすぎます (${volume} ブロック)` };

    const blocks = [];
    for (let y = 0; y < size.y; y++) {
      for (let x = 0; x < size.x; x++) {
        for (let z = 0; z < size.z; z++) {
          const permutation = structure.getBlockPermutation({ x, y, z });
          if (!permutation || permutation.type.id === "minecraft:air") continue;
          const block = { x, y, z, id: permutation.type.id };
          const states = permutation.getAllStates();
          if (states && Object.keys(states).length > 0) block.states = states;
          blocks.push(block);
        }
      }
    }
    const ordered = orderStructureBlocks(blocks);
    if (ordered.error) return ordered;
    const blueprint = { ...definition, size, blocks: ordered.blocks };
    return { blueprint, structureId };
  } catch (e) {
    console.warn(`${LOG} blueprint structure load error (${blueprintId}): ${e}`);
    return { error: "構造データの読み込みに失敗しました。" };
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
const ARCHITECT_LANDING_CLEARANCE = 2;

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
  if (!typeId.startsWith("minecraft:")) return false;
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
      const baseY = inner ? origin.y : origin.y - (bp.groundOffset || 0);
      const height = inner ? bp.size.y : 2;
      for (let dy = height - 1; dy >= 0; dy--) {
        const pos = { x, y: baseY + dy, z };
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
        const pos = { x, y: baseY - 1 - d, z };
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

function findArchitectLanding(dimension, origin, bp, from) {
  const minX = origin.x - 3;
  const maxX = origin.x + bp.size.x + 2;
  const minZ = origin.z - 3;
  const maxZ = origin.z + bp.size.z + 2;
  const candidates = [];
  let checkErrorLogged = false;
  const heightRange = dimension.heightRange;

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      if (x !== minX && x !== maxX && z !== minZ && z !== maxZ) continue;
      for (let y = origin.y - LEVEL_FILL_DEPTH; y <= origin.y + 3; y++) {
        if (y - 1 < heightRange.min || y + ARCHITECT_LANDING_CLEARANCE - 1 > heightRange.max) continue;
        try {
          const floor = dimension.getBlock({ x, y: y - 1, z });
          if (!floor || floor.isAir || floor.isLiquid || isPlant(floor.typeId)) continue;

          let clear = true;
          for (let height = 0; height < ARCHITECT_LANDING_CLEARANCE; height++) {
            const block = dimension.getBlock({ x, y: y + height, z });
            if (!block || !block.isAir) {
              clear = false;
              break;
            }
          }
          if (!clear) continue;

          const target = { x: x + 0.5, y, z: z + 0.5 };
          const dx = from.x - target.x, dy = from.y - target.y, dz = from.z - target.z;
          candidates.push({ target, distance: dx * dx + dy * dy + dz * dz });
        } catch (e) {
          if (!checkErrorLogged) {
            console.warn(`${LOG} landing position check error at ${x},${y},${z}: ${e}`);
            checkErrorLogged = true;
          }
        }
      }
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.length > 0 ? candidates[0].target : undefined;
}

// 棟梁を現場の脇へ呼び寄せる。到着するまで建築は始まらない。
function summonArchitectToSite(job) {
  const a = job.architect;
  if (!a) {
    job.arriveTick = system.currentTick;
    return true;
  }
  try {
    const { origin, bp, dimension } = job;
    const target = findArchitectLanding(dimension, origin, bp, a.location);
    if (!target) {
      console.warn(`${LOG} no safe architect landing position`);
      return false;
    }
    const dx = a.location.x - target.x, dy = a.location.y - target.y, dz = a.location.z - target.z;
    if (a.dimension.id !== dimension.id || dx * dx + dy * dy + dz * dz > 2.25) {
      dimension.spawnParticle("minecraft:basic_smoke_particle", a.location);
      a.teleport(target, {
        dimension,
        facingLocation: { x: origin.x + bp.size.x / 2, y: origin.y + 1, z: origin.z + bp.size.z / 2 }
      });
      dimension.spawnParticle("minecraft:basic_smoke_particle", target);
    }
  } catch (e) {
    console.warn(`${LOG} summonArchitectToSite error: ${e}`);
    return false;
  }
  setArchitectWorking(job, true);
  job.anchor = { x: a.location.x, y: a.location.y, z: a.location.z };
  job.arriveTick = system.currentTick + ARRIVE_WAIT_TICKS;
  return true;
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
    if (!b) return { error: "整地範囲が読み込まれていません" };
    if (op.id === AIR) {
      if (b.isAir) continue;
      if (!isClearable(b.typeId)) return { error: "整地先に撤去できないブロックが置かれました" };
    } else if (!b.isAir && !isPlant(b.typeId)) {
      return { error: "整地先に別のブロックが置かれました" };
    }
    b.setPermutation(BlockPermutation.resolve(op.id));
    if (i === 0) placeEffect(job.dimension, op.pos);
  }
  return { done: job.levelIndex >= job.levelOps.length };
}

function startJob(player, blueprintId, origin) {
  const loaded = loadBlueprint(blueprintId);
  if (loaded.error) {
    console.warn(`${LOG} blueprint load failed (${blueprintId}): ${loaded.error}`);
    notify(player, `§c${loaded.error}`);
    return;
  }
  const bp = loaded.blueprint;
  origin = { x: origin.x, y: origin.y + (bp.groundOffset || 0), z: origin.z };
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
    queue.push({ pos, id: b.id, states: b.states, deferred: Boolean(loaded.structureId && isDeferredDecoration(b.id)) });
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
  if (!summonArchitectToSite(job)) {
    finishJob(job, false, "棟梁が安全に立てる場所がありません");
    return;
  }
  console.warn(`${LOG} job start: ${blueprintId}${loaded.structureId ? ` structure=${loaded.structureId}` : ""} blocks=${queue.length} level=${level.ops.length} architect=${job.architect ? "yes" : "no"} player=${player.name}`);
  notify(player, `§a${bp.name}を使用しました。建築を開始します。`);
  if (loaded.structureId) notify(player, "§e構造の額縁の中身・チェストの中身などは現在復元されません。");
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

// 作業状態を切り替え、腕振りとクライアント側のハンマー表示を連動させる
function setArchitectWorking(job, working) {
  try {
    const architect = job.architect;
    if (!architect || !architect.isValid) return;
    architect.triggerEvent(working ? "nonax:start_work" : "nonax:stop_work");
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
  setArchitectWorking(job, false);
  if (job.architect) {
    // 取りこぼし対策として、少し後にもう一度停止を指示する
    system.runTimeout(() => setArchitectWorking(job, false), 20);
  }
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
        const result = stepLeveling(job);
        if (result.error) {
          finishJob(job, false, result.error);
          continue;
        }
        if (result.done) {
          // 整地後の地面に合わせて囲いや足場を作る
          const tempOrigin = { ...job.origin, y: job.origin.y - (job.bp.groundOffset || 0) };
          job.temp = planTemporaries(job.dimension, job.bp, tempOrigin);
          placeTemporaries(job);
          job.phase = "build";
          notify(job.player, `§a${job.bp.name}の建築を開始します。`);
        }
        continue;
      }
      if (job.phase === "verify") {
        const missing = job.queue.filter((step) => {
          if (!step.deferred) return false;
          const block = job.dimension.getBlock(step.pos);
          return !block || block.typeId !== step.id;
        });
        if (missing.length) {
          const first = missing[0];
          finishJob(job, false, `装飾品 ${missing.length} 個を維持できませんでした (${first.pos.x}, ${first.pos.y}, ${first.pos.z})`);
        } else {
          finishJob(job, true);
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
      if (step.deferred && isDoor(step.id)) {
        const upper = job.queue[job.index + 1];
        if (!upper || upper.id !== step.id || upper.pos.x !== step.pos.x ||
            upper.pos.y !== step.pos.y + 1 || upper.pos.z !== step.pos.z) {
          finishJob(job, false, "ドアの上下の組が不正です");
          continue;
        }
        const upperBlock = job.dimension.getBlock(upper.pos);
        if (!upperBlock) {
          finishJob(job, false, "ドアの設置先が読み込まれていません");
          continue;
        }
        if (!upperBlock.isAir) {
          finishJob(job, false, "ドアの設置先に別のブロックが置かれました");
          continue;
        }
        const lowerPermutation = BlockPermutation.resolve(step.id, step.states);
        const upperPermutation = BlockPermutation.resolve(upper.id, upper.states);
        block.setPermutation(lowerPermutation);
        upperBlock.setPermutation(upperPermutation);
        placeEffect(job.dimension, step.pos);
        placeScaffolding(job, upper.pos.y - job.origin.y + (job.bp.groundOffset || 0));
        job.index += 2;
      } else {
        block.setPermutation(BlockPermutation.resolve(step.id, step.states));
        placeEffect(job.dimension, step.pos);
        placeScaffolding(job, step.pos.y - job.origin.y + (job.bp.groundOffset || 0));
        job.index++;
      }
      if (job.index >= job.queue.length) {
        if (job.queue.some((queued) => queued.deferred)) job.phase = "verify";
        else finishJob(job, true);
      }
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
    if (itemStack?.typeId === BLUEPRINT_HAMMER_TYPE) {
      event.cancel = true;
      return;
    }
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
  world.beforeEvents.itemUse.subscribe((event) => {
    try {
      if (event.itemStack.typeId !== BLUEPRINT_HAMMER_TYPE) return;
      event.cancel = true;
      const { source } = event;
      const dimension = source.dimension;
      const point = {
        x: Math.floor(source.location.x),
        y: Math.floor(source.location.y),
        z: Math.floor(source.location.z)
      };
      system.run(() => handleBlueprintHammer(source, point, dimension));
    } catch (e) {
      console.warn(`${LOG} blueprint hammer use error: ${e}`);
    }
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
