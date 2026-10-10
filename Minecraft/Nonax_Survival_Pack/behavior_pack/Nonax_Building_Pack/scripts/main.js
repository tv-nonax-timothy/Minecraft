import { world, system, BlockPermutation, ItemStack, Direction } from "@minecraft/server";

const DIRT_SLAB_ID = "nonax:dirt_slab";
const GRASS_SLAB_ID = "nonax:grass_slab";
const GRASS_LAYER_ID = "nonax:grass_layer";
const STACKABLE_LAYER_IDS = new Set([
  "nonax:cobblestone_layer",
  "nonax:mossy_cobblestone_layer",
  "nonax:sandstone_layer",
  "nonax:granite_layer",
  "nonax:diorite_layer",
  "nonax:andesite_layer",
  "nonax:gravel_layer",
  "nonax:sand_layer",
  "nonax:smooth_stone_layer",
  "nonax:clay_layer",
  "nonax:red_sand_layer",
  "nonax:red_sandstone_layer",
  "nonax:tuff_layer",
  "nonax:deepslate_layer",
  "nonax:calcite_layer",
  "nonax:rooted_dirt_layer",
  "nonax:coarse_dirt_layer",
  "nonax:podzol_layer",
  "nonax:mycelium_layer",
  "nonax:grass_path_layer",
  "nonax:stone_layer",
  "nonax:packed_mud_layer",
  "nonax:mud_bricks_layer",
  "nonax:chiseled_tuff_bricks_layer",
  "nonax:brick_block_layer",
  "nonax:chiseled_stone_bricks_layer",
  "nonax:cracked_stone_bricks_layer",
  "nonax:mossy_stone_bricks_layer",
  "nonax:stone_bricks_layer",
  "nonax:tuff_bricks_layer",
  "nonax:cracked_deepslate_bricks_layer",
  "nonax:cracked_deepslate_tiles_layer",
  "nonax:deepslate_bricks_layer",
  "nonax:deepslate_tiles_layer",
  "nonax:black_terracotta_layer",
  "nonax:blue_terracotta_layer",
  "nonax:brown_terracotta_layer",
  "nonax:cyan_terracotta_layer",
  "nonax:gray_terracotta_layer",
  "nonax:green_terracotta_layer",
  "nonax:light_blue_terracotta_layer",
  "nonax:lime_terracotta_layer",
  "nonax:magenta_terracotta_layer",
  "nonax:orange_terracotta_layer",
  "nonax:pink_terracotta_layer",
  "nonax:purple_terracotta_layer",
  "nonax:red_terracotta_layer",
  "nonax:silver_terracotta_layer",
  "nonax:white_terracotta_layer",
  "nonax:yellow_terracotta_layer",
  "nonax:terracotta_layer",
  "nonax:oak_log_layer"
]);
const GLASS_SLAB_ID = "nonax:glass_slab";
const WALL_IDS = new Set([
  "nonax:acacia_wall",
  "nonax:owk_wall",
  "nonax:jungle_wall",
  "nonax:birch_wall",
  "nonax:dark_owk_wall",
  "nonax:spruce_wall",
  "nonax:mangrove_wall",
  "nonax:cherry_wall",
  "nonax:pale_oak_wall",
  "nonax:poplar_wall",
  "nonax:glass_wall"
]);
const WALL_DIRECTIONS = [
  { name: "north", state: "nonax:north", dx: 0, dz: -1 },
  { name: "east", state: "nonax:west", dx: 1, dz: 0 },
  { name: "south", state: "nonax:south", dx: 0, dz: 1 },
  { name: "west", state: "nonax:east", dx: -1, dz: 0 }
];

const WALL_CONNECTION_EXCLUDED_TYPES = new Set([
  "minecraft:grass",
  "minecraft:tall_grass",
  "minecraft:short_grass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:deadbush",
  "minecraft:allium",
  "minecraft:azure_bluet",
  "minecraft:blue_orchid",
  "minecraft:cornflower",
  "minecraft:dandelion",
  "minecraft:lily_of_the_valley",
  "minecraft:oxeye_daisy",
  "minecraft:poppy",
  "minecraft:red_tulip",
  "minecraft:orange_tulip",
  "minecraft:white_tulip",
  "minecraft:pink_tulip",
  "minecraft:sunflower",
  "minecraft:lilac",
  "minecraft:rose_bush",
  "minecraft:peony",
  "minecraft:wither_rose",
  "minecraft:azalea",
  "minecraft:flowering_azalea",
  "minecraft:pink_petals",
  "minecraft:spore_blossom",
  "minecraft:seagrass",
  "minecraft:tall_seagrass",
  "minecraft:kelp",
  "minecraft:kelp_plant",
  "minecraft:sugar_cane",
  "minecraft:vine",
  "minecraft:glow_lichen",
  "minecraft:leaf_litter",
  "minecraft:snow_layer",
  "minecraft:farmland",
  "minecraft:dirt_path",
  "minecraft:cake",
  "minecraft:bed",
  "minecraft:lily_pad",
  "minecraft:lever",
  "minecraft:redstone_wire",
  "minecraft:tripwire",
  "minecraft:repeater",
  "minecraft:comparator",
  "minecraft:daylight_detector",
  "minecraft:rail",
  "minecraft:powered_rail",
  "minecraft:detector_rail",
  "minecraft:activator_rail",
  "minecraft:torch",
  "minecraft:wall_torch",
  "minecraft:redstone_torch",
  "minecraft:redstone_wall_torch",
  "minecraft:soul_torch",
  "minecraft:soul_wall_torch",
  "minecraft:unlit_redstone_torch",
  "minecraft:underwater_torch",
  "minecraft:copper_torch",
  "minecraft:copper_wall_torch",
  "minecraft:lantern",
  "minecraft:soul_lantern",
  "minecraft:copper_lantern",
  "minecraft:exposed_copper_lantern",
  "minecraft:weathered_copper_lantern",
  "minecraft:oxidized_copper_lantern",
  "minecraft:waxed_copper_lantern",
  "minecraft:waxed_exposed_copper_lantern",
  "minecraft:waxed_weathered_copper_lantern",
  "minecraft:waxed_oxidized_copper_lantern",
  "minecraft:flower_pot",
  "nonax:grass_layer",
  ...STACKABLE_LAYER_IDS
]);

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
  const typeId = block.typeId;
  if (WALL_CONNECTION_EXCLUDED_TYPES.has(typeId)) return false;
  if (
    typeId.endsWith("_slab") ||
    typeId.endsWith("_carpet") ||
    typeId.endsWith("_pressure_plate") ||
    typeId.endsWith("_button") ||
    typeId.endsWith("_trapdoor") ||
    typeId.endsWith("_leaves") ||
    typeId.endsWith("_flower") ||
    typeId.endsWith("_tulip")
  ) return false;

  if (WALL_IDS.has(typeId) || (typeId.startsWith("minecraft:") && typeId.endsWith("_wall"))) return true;

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
  const isGlassSlab =
    (typeof brokenBlockPermutation.matches === "function" && brokenBlockPermutation.matches(GLASS_SLAB_ID)) ||
    brokenBlockPermutation.type?.id === GLASS_SLAB_ID;

  const brokenTypeId = brokenBlockPermutation.type?.id;
  if (brokenTypeId === GRASS_LAYER_ID || STACKABLE_LAYER_IDS.has(brokenTypeId)) {
    if (isPlayerCreative(player)) return;
    const layerCount = brokenBlockPermutation.getState("nonax:layers");
    if (typeof layerCount !== "number" || layerCount < 1 || layerCount > 7) {
      console.warn(`レイヤーブロックの層数 state が不正です: ${brokenTypeId} (${layerCount})`);
      return;
    }
    const dropLocation = {
      x: block.location.x + 0.5,
      y: block.location.y + 0.2,
      z: block.location.z + 0.5
    };
    system.run(() => {
      try {
        dimension.spawnItem(new ItemStack(brokenTypeId, layerCount), dropLocation);
      } catch (err) {
        console.warn(`レイヤーブロックのドロップに失敗しました: ${err}`);
      }
    });
    return;
  }

  if (!isGrassSlab && !isGlassSlab) return;

  // クリエイティブモードの場合はドロップしない
  if (isPlayerCreative(player)) return;

  const isSilk = hasSilkTouch(itemStackBeforeBreak);
  if (isGlassSlab) return;

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
  if (itemStack.typeId === "nonax:oak_log_layer") {
    const faceStr = typeof blockFace === "string" ? blockFace : blockFace?.toString();
    const faceName = ["North", "East", "South", "West", "Up", "Down"].find(
      (name) => faceStr?.toLowerCase() === name.toLowerCase() || blockFace === Direction?.[name]
    );

    if (targetId === itemStack.typeId || faceName) {
      event.cancel = true;
      const directionByFace = { North: 0, East: 3, South: 2, West: 1, Up: 4, Down: 5 };
      const faceOffsets = {
        North: { x: 0, y: 0, z: -1 },
        East: { x: 1, y: 0, z: 0 },
        South: { x: 0, y: 0, z: 1 },
        West: { x: -1, y: 0, z: 0 },
        Up: { x: 0, y: 1, z: 0 },
        Down: { x: 0, y: -1, z: 0 }
      };
      const targetPos = targetId === itemStack.typeId
        ? { x: block.location.x, y: block.location.y, z: block.location.z }
        : {
            x: block.location.x + faceOffsets[faceName].x,
            y: block.location.y + faceOffsets[faceName].y,
            z: block.location.z + faceOffsets[faceName].z
          };
      const adjacentBlock = player.dimension.getBlock(targetPos);
      if (targetId !== itemStack.typeId && adjacentBlock?.typeId !== itemStack.typeId &&
          !adjacentBlock?.isAir && adjacentBlock?.typeId !== "minecraft:air") return;

      const stacking = adjacentBlock?.typeId === itemStack.typeId;
      const stackDirection = stacking
        ? adjacentBlock.permutation.getState("nonax:log_facing")
        : directionByFace[faceName];
      const currentLayers = stacking
        ? adjacentBlock.permutation.getState("nonax:layers")
        : 0;
      if (stacking && (typeof currentLayers !== "number" || currentLayers >= 7)) return;
      const blockPos = { ...targetPos };
      const selectedSlot = player.selectedSlotIndex;
      const eventItemAmount = itemStack.amount;

      system.run(() => {
        try {
          const destination = player.dimension.getBlock(blockPos);
          if (!destination) return;
          if (stacking) {
            if (destination.typeId !== itemStack.typeId ||
                destination.permutation.getState("nonax:layers") !== currentLayers) return;
          } else if (!destination.isAir && destination.typeId !== "minecraft:air") {
            return;
          }

          let inventory;
          let currentItem;
          let consumeHeldItem = false;
          if (!isPlayerCreative(player)) {
            inventory = player.getComponent("minecraft:inventory");
            currentItem = inventory?.container?.getItem(selectedSlot);
            if (player.selectedSlotIndex !== selectedSlot) {
              throw new Error("手持ちのオークの丸太レイヤーブロックを確認できません。");
            }
            if (currentItem?.typeId === itemStack.typeId && currentItem.amount === eventItemAmount) {
              consumeHeldItem = true;
            } else if (
              (currentItem?.typeId === itemStack.typeId && currentItem.amount === eventItemAmount - 1) ||
              (!currentItem && eventItemAmount === 1)
            ) {
              // The interaction consumed the stack item before this deferred placement ran.
            } else {
              throw new Error("手持ちのオークの丸太レイヤーブロックが設置中に変更されました。");
            }
          }

          const previousPermutation = destination.permutation;
          const layers = stacking ? currentLayers + 1 : 1;
          destination.setPermutation(BlockPermutation.resolve(itemStack.typeId, {
            "nonax:layers": layers,
            "nonax:log_facing": stackDirection
          }));

          if (consumeHeldItem && currentItem) {
            try {
              if (currentItem.amount > 1) {
                const nextItem = currentItem.clone();
                nextItem.amount -= 1;
                inventory.container.setItem(selectedSlot, nextItem);
              } else {
                inventory.container.setItem(selectedSlot, undefined);
              }
            } catch (err) {
              destination.setPermutation(previousPermutation);
              throw err;
            }
          }
        } catch (err) {
          console.warn(`オークの丸太レイヤーブロックの設置に失敗しました: ${err}`);
        }
      });
      return;
    }
  }

  if (itemStack.typeId === GRASS_LAYER_ID || STACKABLE_LAYER_IDS.has(itemStack.typeId)) {
    const faceStr = typeof blockFace === "string" ? blockFace : blockFace?.toString();
    const faceName = ["North", "South", "East", "West", "Up", "Down"].find(
      (name) => faceStr?.toLowerCase() === name.toLowerCase() || blockFace === Direction?.[name]
    );
    const faceOffsets = {
      North: { x: 0, y: 0, z: -1 },
      South: { x: 0, y: 0, z: 1 },
      East: { x: 1, y: 0, z: 0 },
      West: { x: -1, y: 0, z: 0 },
      Up: { x: 0, y: 1, z: 0 },
      Down: { x: 0, y: -1, z: 0 }
    };
    const directTopClick = targetId === itemStack.typeId && faceName === "Up";
    let stackBlock = directTopClick ? block : undefined;

    if (!stackBlock && targetId !== itemStack.typeId && faceName) {
      const offset = faceOffsets[faceName];
      const adjacentPos = {
        x: block.location.x + offset.x,
        y: block.location.y + offset.y,
        z: block.location.z + offset.z
      };
      const adjacentBlock = player.dimension.getBlock(adjacentPos);
      if (adjacentBlock?.typeId === itemStack.typeId) {
        stackBlock = adjacentBlock;
      } else if (faceName !== "Up" && faceName !== "Down" && faceLocation?.y >= 0.5) {
        const layerBelow = player.dimension.getBlock({
          x: adjacentPos.x,
          y: adjacentPos.y - 1,
          z: adjacentPos.z
        });
        if (layerBelow?.typeId === itemStack.typeId) {
          stackBlock = layerBelow;
        }
      }
    }

    if (stackBlock) {
      event.cancel = true;
      const stackId = itemStack.typeId;
      const blockPos = {
        x: stackBlock.location.x,
        y: stackBlock.location.y,
        z: stackBlock.location.z
      };
      const currentLayers = stackBlock.permutation.getState("nonax:layers");
      if (typeof currentLayers !== "number") {
        throw new Error("草レイヤーブロックの層数 state が不正です。");
      }
      const stackMax = stackId === GRASS_LAYER_ID ? 7 : STACKABLE_LAYER_IDS.has(stackId) ? 7 : 0;
      if (currentLayers >= stackMax) return;

      system.run(() => {
        try {
          const targetBlock = player.dimension.getBlock(blockPos);
          if (!targetBlock || targetBlock.typeId !== stackId) return;

          const latestLayers = targetBlock.permutation.getState("nonax:layers");
          if (latestLayers !== currentLayers || latestLayers >= stackMax) return;

          let inventory;
          let slot;
          let currentItem;
          if (!isPlayerCreative(player)) {
            inventory = player.getComponent("minecraft:inventory");
            slot = player.selectedSlotIndex;
            currentItem = inventory?.container?.getItem(slot);
            if (!currentItem || currentItem.typeId !== stackId) {
              throw new Error("手持ちのレイヤーブロックを確認できません。");
            }
          }

          const previousPermutation = targetBlock.permutation;
          targetBlock.setPermutation(BlockPermutation.resolve(stackId, {
            "nonax:layers": currentLayers + 1
          }));

          if (currentItem) {
            try {
              if (currentItem.amount > 1) {
                const nextItem = currentItem.clone();
                nextItem.amount -= 1;
                inventory.container.setItem(slot, nextItem);
              } else {
                inventory.container.setItem(slot, undefined);
              }
            } catch (err) {
              targetBlock.setPermutation(previousPermutation);
              throw err;
            }
          }
        } catch (err) {
          console.warn(`草レイヤーブロックの積み重ねに失敗しました: ${err}`);
        }
      });
      return;
    }
  }

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
