// 設計図データ。座標は建築起点からの相対オフセット。
export const BLUEPRINTS = {
  "nonax:blueprint_lv1": {
    name: "見習い棟梁の設計図",
    signName: "nonax.structure.nonax_lv1_house",
    structureSuffix: "nonax_lv1_house",
    groundOffset: -1
  },
  "nonax:blueprint_lv2": {
    name: "一人前棟梁の設計図",
    signName: "nonax.structure.nonax_lv2_house",
    structureSuffix: "nonax_lv2_house",
    groundOffset: -1
  },
  "nonax:blueprint_lv3": {
    name: "熟練棟梁の設計図",
    signName: "nonax.structure.nonax_lv3_minka",
    size: { x: 7, y: 8, z: 7 },
    blocks: buildMinka()
  },
  "nonax:blueprint_lv4": {
    name: "名人棟梁の設計図",
    signName: "nonax.structure.nonax_lv4_house",
    structureSuffix: "nonax_lv4_house",
    groundOffset: -1
  },
  "nonax:blueprint_lv5": {
    name: "達人棟梁の設計図",
    signName: "nonax.structure.nonax_lv5_pagoda",
    size: { x: 9, y: 20, z: 9 },
    blocks: buildPagoda()
  }
};

// 9x20x9 の五重の塔。石レンガの基壇の上に 5 層（壁 2 段 + 張り出した屋根 1 段）を重ね、上の層ほど細くなる。
// 中心の足場ブロックの柱で最上層まで上れ、最上部に相輪（柵）が立つ。出入口は 1 層目の z=1 側の中央。
function buildPagoda() {
  const blocks = [];
  const add = (x, y, z, id) => blocks.push({ x, y, z, id });
  const c = 4;
  const halfWidths = [3, 3, 2, 2, 1];
  for (let x = 0; x < 9; x++) {
    for (let z = 0; z < 9; z++) add(x, 0, z, "minecraft:stone_bricks");
  }
  for (let k = 0; k < 5; k++) {
    const h = halfWidths[k];
    const yb = 1 + 3 * k;
    for (let dy = 0; dy < 2; dy++) {
      const y = yb + dy;
      for (let x = c - h; x <= c + h; x++) {
        for (let z = c - h; z <= c + h; z++) {
          const onX = x === c - h || x === c + h;
          const onZ = z === c - h || z === c + h;
          if (onX && onZ) {
            add(x, y, z, "minecraft:dark_oak_log");
          } else if (onX || onZ) {
            if (k === 0 && dy < 2 && z === c - h && x === c) continue;
            const isWindow = dy === 1 && (x === c || z === c);
            add(x, y, z, isWindow ? "minecraft:glass" : "minecraft:white_concrete");
          } else if (x === c && z === c) {
            add(x, y, z, "minecraft:scaffolding");
          }
        }
      }
    }
    const roofY = yb + 2;
    for (let x = c - h - 1; x <= c + h + 1; x++) {
      for (let z = c - h - 1; z <= c + h + 1; z++) {
        add(x, roofY, z, x === c && z === c ? "minecraft:scaffolding" : "minecraft:dark_oak_slab");
      }
    }
  }
  for (let y = 16; y < 20; y++) add(c, y, c, "minecraft:dark_oak_fence");
  return blocks;
}

// 7x8x7 の 2 階建て民家。母屋は 5x5（オフセット 1〜5）、出入口は z=1 側の中央、
// 内部の足場ブロックの柱で 2 階へ上れる。
function buildMinka() {
  const blocks = [];
  const add = (x, y, z, id) => blocks.push({ x, y, z, id });
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        const inBody = x >= 1 && x <= 5 && z >= 1 && z <= 5;
        const isRing = inBody && (x === 1 || x === 5 || z === 1 || z === 5);
        const isCorner = (x === 1 || x === 5) && (z === 1 || z === 5);
        const isLadder = x === 2 && z === 2;
        if (y === 0) {
          if (inBody) add(x, y, z, "minecraft:stone_bricks");
        } else if (y === 1 || y === 2 || y === 4 || y === 5) {
          if (isCorner) {
            add(x, y, z, "minecraft:dark_oak_log");
          } else if (isRing) {
            const isDoorway = z === 1 && x === 3 && y <= 2;
            const isWindow = y === 4 && (x === 3 || z === 3);
            if (isDoorway) continue;
            add(x, y, z, isWindow ? "minecraft:glass" : "minecraft:white_concrete");
          } else if (inBody && isLadder && y <= 4) {
            add(x, y, z, "minecraft:scaffolding");
          }
        } else if (y === 3) {
          if (inBody) add(x, y, z, isLadder ? "minecraft:scaffolding" : "minecraft:dark_oak_planks");
        } else if (y === 6) {
          add(x, y, z, "minecraft:dark_oak_slab");
        } else if (y === 7) {
          if (inBody) add(x, y, z, "minecraft:dark_oak_slab");
        }
      }
    }
  }
  return blocks;
}

// 建築開始前の設計図データ検証。問題があれば理由の文字列を返し、正常なら null。
export function validateBlueprint(bp) {
  if (!bp || !Array.isArray(bp.blocks) || bp.blocks.length === 0) return "設計図データが空です";
  const seen = new Set();
  for (const b of bp.blocks) {
    if (typeof b.id !== "string" || !b.id.startsWith("minecraft:")) return `不正なブロックID: ${b.id}`;
    if (b.x < 0 || b.y < 0 || b.z < 0 || b.x >= bp.size.x || b.y >= bp.size.y || b.z >= bp.size.z) {
      return `範囲外の座標: ${b.x},${b.y},${b.z}`;
    }
    const key = `${b.x},${b.y},${b.z}`;
    if (seen.has(key)) return `座標が重複しています: ${key}`;
    seen.add(key);
  }
  return null;
}
