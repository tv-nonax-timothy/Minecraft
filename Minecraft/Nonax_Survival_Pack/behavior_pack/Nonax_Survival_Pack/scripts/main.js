import { world, system, BlockPermutation, ItemStack, Direction } from "@minecraft/server";

const DIRT_SLAB_ID = "nonax:dirt_slab";
const GRASS_SLAB_ID = "nonax:grass_slab";
const WALL_IDS = new Set([
  "nonax:acacia_wall",
  "nonax:owk_wall",
  "nonax:jungle_wall",
  "nonax:birch_wall",
  "nonax:dark_owk_wall",
  "nonax:spruce_wall",
  "nonax:mangrove_wall",
  "nonax:cherry_wall",
  "nonax:pale_oak_wall"
]);
const WALL_DIRECTIONS = [
  { name: "north", state: "nonax:north", dx: 0, dz: -1 },
  { name: "east", state: "nonax:west", dx: 1, dz: 0 },
  { name: "south", state: "nonax:south", dx: 0, dz: 1 },
  { name: "west", state: "nonax:east", dx: -1, dz: 0 }
];

// スキャン範囲の設定
const SCAN_RADIUS_XZ = 10; // 水平半径 (周囲 21x21 ブロック)
const SCAN_RANGE_Y = [-1, 0, 1]; // 垂直範囲 (足元の下、足元、足元の上の3層)
const CHECK_INTERVAL_TICKS = 20; // チェック間隔 (20 ticks = 1秒)

// バニラ準拠の成長確率設定 (ランダムティックを模倣)
// 隣接する草ブロック1個あたりの成長確率 (毎秒 4% -> 草1個なら平均約25秒で変化)
const GROW_CHANCE_PER_NEIGHBOR = 0.04;
// 最大確率 (草に囲まれている場合でも最大 15% -> 平均約7秒)
const MAX_GROW_CHANCE = 0.15;

// 草ブロック（伝播元）の判定
function isGrassBlock(block) {
  if (!block) return false;
  const id = block.typeId;
  return (
    id === "minecraft:grass_block" ||
    id === "minecraft:grass" ||
    id === "minecraft:mycelium" ||
    id === GRASS_SLAB_ID
  );
}

function canWallConnectTo(block) {
  if (!block) return false;
  if (WALL_IDS.has(block.typeId) || (block.typeId.startsWith("minecraft:") && block.typeId.endsWith("_wall"))) {
    return true;
  }

  try {
    return !block.isAir && !block.isLiquid;
  } catch {
    return false;
  }
}

function updateWallConnectionsAt(dimension, pos) {
  try {
    const block = dimension.getBlock(pos);
    if (!block || !WALL_IDS.has(block.typeId)) return;

    let permutation = block.permutation;
    let changed = false;
    for (const direction of WALL_DIRECTIONS) {
      const neighbor = dimension.getBlock({ x: pos.x + direction.dx, y: pos.y, z: pos.z + direction.dz });
      const connected = canWallConnectTo(neighbor);
      if (permutation.getState(direction.state) !== connected) {
        permutation = permutation.withState(direction.state, connected);
        changed = true;
      }
    }

    if (changed) block.setPermutation(permutation);
  } catch {
    // Ignore unloaded neighboring chunks while scanning.
  }
}

function refreshWallsAround(dimension, pos) {
  updateWallConnectionsAt(dimension, pos);
  for (const direction of WALL_DIRECTIONS) {
    updateWallConnectionsAt(dimension, {
      x: pos.x + direction.dx,
      y: pos.y,
      z: pos.z + direction.dz
    });
  }
}

// 周囲（水平4方向 + 上下1ブロックの高低差）にある草ブロックの数をカウント
function countGrassNeighbors(dimension, pos) {
  let count = 0;
  const horizontalOffsets = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 }
  ];

  for (const { x, z } of horizontalOffsets) {
    for (let y = -1; y <= 1; y++) {
      const neighborPos = { x: pos.x + x, y: pos.y + y, z: pos.z + z };
      const neighbor = dimension.getBlock(neighborPos);

      if (isGrassBlock(neighbor)) {
        // 伝播元の草ブロック直上が光を遮られていないか（空気が透過ブロック）
        const neighborAbove = dimension.getBlock({ x: neighborPos.x, y: neighborPos.y + 1, z: neighborPos.z });
        if (neighborAbove && neighborAbove.typeId === "minecraft:air") {
          count++;
          break; // この水平方向からは1つ見つかればOK
        }
      }
    }
  }

  return count;
}

// 光量判定（直上が空気かつ光量9以上）
function hasEnoughLight(dimension, pos) {
  const topPos = { x: pos.x, y: pos.y + 1, z: pos.z };
  const topBlock = dimension.getBlock(topPos);
  if (!topBlock || topBlock.typeId !== "minecraft:air") {
    return false;
  }

  return dimension.getLightLevel(topPos) >= 9;
}

function tryGrowDirtSlab(dimension, pos) {
  const block = dimension.getBlock(pos);
  if (!block) return;
  if (WALL_IDS.has(block.typeId)) {
    updateWallConnectionsAt(dimension, pos);
    return;
  }
  if (block.typeId !== DIRT_SLAB_ID) return;

  // 直上が空気かつ光量が9以上か
  if (!hasEnoughLight(dimension, pos)) {
    return;
  }

  // 周囲の伝播可能な草ブロック数を取得
  const grassNeighbors = countGrassNeighbors(dimension, pos);
  if (grassNeighbors === 0) {
    return;
  }

  // バニラに合わせた確率判定（置いてすぐではなく、時間経過でランダムに変化）
  const growChance = Math.min(MAX_GROW_CHANCE, grassNeighbors * GROW_CHANCE_PER_NEIGHBOR);
  if (Math.random() >= growChance) {
    return;
  }

  let currentHalf = "bottom";
  try {
    currentHalf = block.permutation.getState("minecraft:vertical_half") || "bottom";
  } catch {}

  block.setPermutation(BlockPermutation.resolve(GRASS_SLAB_ID, { "minecraft:vertical_half": currentHalf }));
}

system.runInterval(() => {
  for (const player of world.getPlayers()) {
    const location = player.location;
    if (!location) {
      continue;
    }

    const originX = Math.floor(location.x);
    const originY = Math.floor(location.y);
    const originZ = Math.floor(location.z);
    const dimension = player.dimension;

    for (const dy of SCAN_RANGE_Y) {
      const targetY = originY + dy;
      for (let dx = -SCAN_RADIUS_XZ; dx <= SCAN_RADIUS_XZ; dx++) {
        for (let dz = -SCAN_RADIUS_XZ; dz <= SCAN_RADIUS_XZ; dz++) {
          const pos = { x: originX + dx, y: targetY, z: originZ + dz };
          tryGrowDirtSlab(dimension, pos);
        }
      }
    }
  }
}, CHECK_INTERVAL_TICKS);

// クリエイティブモード判定
function isPlayerCreative(player) {
  if (!player) return false;
  try {
    return player.getGameMode() === "creative";
  } catch {
    return false;
  }
}

// シルクタッチエンチャント判定
function hasSilkTouch(itemStack) {
  if (!itemStack) return false;
  try {
    const enchantable = itemStack.getComponent("minecraft:enchantable");
    if (!enchantable) return false;

    if (typeof enchantable.hasEnchantment === "function") {
      if (enchantable.hasEnchantment("silk_touch") || enchantable.hasEnchantment("minecraft:silk_touch")) {
        return true;
      }
    }

    if (typeof enchantable.getEnchantments === "function") {
      const enchantments = enchantable.getEnchantments();
      if (Array.isArray(enchantments)) {
        return enchantments.some((e) => {
          const id = e?.type?.id || e?.id;
          return id === "silk_touch" || id === "minecraft:silk_touch";
        });
      }
    }
  } catch {
    // 判定エラー時は通常ドロップへ
  }
  return false;
}

// 1. 草のハーフブロック破壊時のドロップ処理（シルクタッチ判定）
world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { block, dimension, brokenBlockPermutation, itemStackBeforeBreak, player } = event;
  const brokenLocation = block?.location;
  if (brokenLocation) {
    const pos = { x: brokenLocation.x, y: brokenLocation.y, z: brokenLocation.z };
    system.run(() => refreshWallsAround(dimension, pos));
  }
  if (!brokenBlockPermutation) return;

  const isGrassSlab =
    (typeof brokenBlockPermutation.matches === "function" && brokenBlockPermutation.matches(GRASS_SLAB_ID)) ||
    brokenBlockPermutation.type?.id === GRASS_SLAB_ID;

  if (!isGrassSlab) return;

  // クリエイティブモードの場合はドロップしない
  if (isPlayerCreative(player)) return;

  const isSilk = hasSilkTouch(itemStackBeforeBreak);
  const dropId = isSilk ? GRASS_SLAB_ID : DIRT_SLAB_ID;

  const dropLocation = {
    x: block.location.x + 0.5,
    y: block.location.y + 0.2,
    z: block.location.z + 0.5
  };

  system.run(() => {
    try {
      dimension.spawnItem(new ItemStack(dropId, 1), dropLocation);
    } catch (err) {
      console.warn(`アイテムドロップに失敗しました: ${err}`);
    }
  });
});

// 2. ハーフブロックへの重ね置き時の即時土ブロック化（設置前イベントで横取り＆即一体化）
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, blockFace, faceLocation, itemStack, player } = event;
  if (!block || !itemStack || !player) return;

  const targetId = block.typeId;
  if (targetId !== DIRT_SLAB_ID && targetId !== GRASS_SLAB_ID) return;

  const heldId = itemStack.typeId;
  if (heldId !== DIRT_SLAB_ID && heldId !== GRASS_SLAB_ID) return;

  let verticalHalf = "bottom";
  try {
    verticalHalf = block.permutation?.getState("minecraft:vertical_half") || "bottom";
  } catch {}

  const faceStr = typeof blockFace === "string" ? blockFace : blockFace?.toString();
  const isUp = faceStr === "Up" || blockFace === Direction?.Up;
  const isDown = faceStr === "Down" || blockFace === Direction?.Down;

  let shouldCombine = false;

  // 下付きハーフブロックの場合：上面をクリック、または側面の上半分をクリックしたとき
  if (verticalHalf === "bottom") {
    if (isUp || (faceLocation && faceLocation.y >= 0.5)) {
      shouldCombine = true;
    }
  }
  // 上付きハーフブロックの場合：下面をクリック、または側面の下半分をクリックしたとき
  else if (verticalHalf === "top") {
    if (isDown || (faceLocation && faceLocation.y < 0.5)) {
      shouldCombine = true;
    }
  }

  if (shouldCombine) {
    // 通常の別ブロックとしての配置をキャンセル（上の空間に一瞬見える現象を完全に防止）
    event.cancel = true;

    const dimension = player.dimension;
    const blockPos = { x: block.location.x, y: block.location.y, z: block.location.z };

    system.run(() => {
      try {
        const targetBlock = dimension.getBlock(blockPos);
        if (!targetBlock) return;
        if (targetBlock.typeId !== DIRT_SLAB_ID && targetBlock.typeId !== GRASS_SLAB_ID) return;

        // 即座に標準の土ブロックに変化
        targetBlock.setPermutation(BlockPermutation.resolve("minecraft:dirt"));

        // 設置音を再生
        try {
          dimension.playSound("step.grass", blockPos, { volume: 1.0, pitch: 0.8 });
        } catch {}

        // サバイバルモードなら手持ちのハーフブロックを1個消費
        if (!isPlayerCreative(player)) {
          try {
            const inventory = player.getComponent("minecraft:inventory");
            if (inventory && inventory.container) {
              const slot = player.selectedSlotIndex;
              const currentItem = inventory.container.getItem(slot);
              if (currentItem && (currentItem.typeId === DIRT_SLAB_ID || currentItem.typeId === GRASS_SLAB_ID)) {
                if (currentItem.amount > 1) {
                  currentItem.amount -= 1;
                  inventory.container.setItem(slot, currentItem);
                } else {
                  inventory.container.setItem(slot, undefined);
                }
              }
            }
          } catch (invErr) {
            console.warn(`アイテム消費に失敗しました: ${invErr}`);
          }
        }
      } catch (err) {
        console.warn(`土ブロックの一体化に失敗しました: ${err}`);
      }
    });
  }
});

// 3. フォールバック：万が一通常の設置が成立した場合の土ブロック化処理
world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { block, dimension } = event;
  if (!block) return;

  const placedLocation = block.location;
  const placedPosition = { x: placedLocation.x, y: placedLocation.y, z: placedLocation.z };
  system.run(() => refreshWallsAround(dimension, placedPosition));

  const placedTypeId = block.typeId;
  if (placedTypeId !== DIRT_SLAB_ID && placedTypeId !== GRASS_SLAB_ID) {
    return;
  }

  const placedPos = { x: block.location.x, y: block.location.y, z: block.location.z };
  const belowPos = { x: placedPos.x, y: placedPos.y - 1, z: placedPos.z };

  const belowBlock = dimension.getBlock(belowPos);
  if (!belowBlock) return;

  const belowTypeId = belowBlock.typeId;
  if (belowTypeId === DIRT_SLAB_ID || belowTypeId === GRASS_SLAB_ID) {
    system.run(() => {
      try {
        const targetBelow = dimension.getBlock(belowPos);
        const targetPlaced = dimension.getBlock(placedPos);

        // 下のハーフブロックを標準の土ブロックに置き換え
        if (targetBelow && (targetBelow.typeId === DIRT_SLAB_ID || targetBelow.typeId === GRASS_SLAB_ID)) {
          targetBelow.setPermutation(BlockPermutation.resolve("minecraft:dirt"));
        }
        // 上に設置されたハーフブロックを空気に戻して1つの土ブロックとして一体化
        if (targetPlaced && (targetPlaced.typeId === DIRT_SLAB_ID || targetPlaced.typeId === GRASS_SLAB_ID)) {
          targetPlaced.setPermutation(BlockPermutation.resolve("minecraft:air"));
        }
      } catch (err) {
        console.warn(`ハーフブロックの一体化に失敗しました: ${err}`);
      }
    });
  }
});

