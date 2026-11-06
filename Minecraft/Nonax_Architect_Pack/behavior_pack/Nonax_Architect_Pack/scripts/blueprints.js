// 設計図データ。座標は建築起点からの相対オフセット。
export const BLUEPRINTS = {
  "nonax:blueprint_lv1": {
    name: "見習い棟梁の設計図",
    size: { x: 3, y: 3, z: 3 },
    blocks: buildTestHut()
  }
};

// 3x3x3 の小屋（床・壁・屋根、正面中央に出入口）
function buildTestHut() {
  const blocks = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        const isFloor = y === 0;
        const isRoof = y === 2;
        const isWall = x === 0 || x === 2 || z === 0 || z === 2;
        const isDoorway = z === 0 && x === 1 && y === 1;
        if (isFloor) {
          blocks.push({ x, y, z, id: "minecraft:oak_planks" });
        } else if (isRoof) {
          blocks.push({ x, y, z, id: "minecraft:oak_slab" });
        } else if (isWall && !isDoorway) {
          blocks.push({ x, y, z, id: "minecraft:spruce_planks" });
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
