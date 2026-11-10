const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const { quarterTurnsFromFacing, rotateBlueprint, rotateStates, placeOriginAhead } = await import(
    pathToFileURL(path.join(__dirname, "../behavior_pack/Nonax_Architect_Pack/scripts/rotation.js")).href
  );

  // 視線方向 → 正面(北)をプレイヤー側(視線の逆)へ向ける回転数
  assert.equal(quarterTurnsFromFacing({ x: 0, z: 1 }), 0); // 南向き: 正面は北
  assert.equal(quarterTurnsFromFacing({ x: -1, z: 0 }), 1); // 西向き: 正面は東
  assert.equal(quarterTurnsFromFacing({ x: 0, z: -1 }), 2); // 北向き: 正面は南
  assert.equal(quarterTurnsFromFacing({ x: 1, z: 0 }), 3); // 東向き: 正面は西

  const bp = {
    size: { x: 3, y: 2, z: 5 },
    blocks: [
      { x: 0, y: 0, z: 0, id: "minecraft:stone" },
      { x: 2, y: 1, z: 4, id: "minecraft:oak_stairs", states: { weirdo_direction: 3, upside_down_bit: 1 } },
      { x: 1, y: 0, z: 0, id: "minecraft:wooden_door", states: { "minecraft:cardinal_direction": "north", upper_block_bit: 0 } },
      { x: 1, y: 1, z: 0, id: "minecraft:wooden_door", states: { "minecraft:cardinal_direction": "north", upper_block_bit: 1 } }
    ]
  };
  const original = JSON.stringify(bp);

  for (let turns = 0; turns < 4; turns++) {
    const { blueprint } = rotateBlueprint(bp, turns);
    const odd = turns % 2 === 1;
    assert.deepEqual(blueprint.size, odd ? { x: 5, y: 2, z: 3 } : { x: 3, y: 2, z: 5 });
    const seen = new Set();
    for (const b of blueprint.blocks) {
      assert.ok(b.x >= 0 && b.x < blueprint.size.x && b.z >= 0 && b.z < blueprint.size.z, `範囲外 turns=${turns}`);
      const k = `${b.x},${b.y},${b.z}`;
      assert.ok(!seen.has(k), "座標が重複");
      seen.add(k);
    }
  }
  assert.equal(JSON.stringify(bp), original, "元の設計図を変更しない");

  // 4 回の 90° 回転で元に戻る
  let current = bp;
  for (let i = 0; i < 4; i++) current = rotateBlueprint(current, 1).blueprint;
  assert.deepEqual(current, bp);

  // 正面(北壁・北向きドア)の座標と向き
  const doorAt = (turns) => rotateBlueprint(bp, turns).blueprint.blocks[2];
  assert.deepEqual([doorAt(1).x, doorAt(1).z, doorAt(1).states["minecraft:cardinal_direction"]], [4, 1, "east"]);
  assert.deepEqual([doorAt(2).x, doorAt(2).z, doorAt(2).states["minecraft:cardinal_direction"]], [1, 4, "south"]);
  assert.deepEqual([doorAt(3).x, doorAt(3).z, doorAt(3).states["minecraft:cardinal_direction"]], [0, 1, "west"]);
  // ドア上下は同じ XZ を保つ
  for (let t = 1; t < 4; t++) {
    const r = rotateBlueprint(bp, t).blueprint.blocks;
    assert.equal(r[2].x, r[3].x);
    assert.equal(r[2].z, r[3].z);
    assert.equal(r[3].states.upper_block_bit, 1);
  }

  // 階段: 3(北向き上り)を時計回りに 東(0) → 南(2) → 西(1)
  assert.equal(rotateStates("minecraft:oak_stairs", { weirdo_direction: 3, upside_down_bit: 1 }, 1).states.weirdo_direction, 0);
  assert.equal(rotateStates("minecraft:oak_stairs", { weirdo_direction: 3 }, 2).states.weirdo_direction, 2);
  assert.equal(rotateStates("minecraft:oak_stairs", { weirdo_direction: 3, upside_down_bit: 1 }, 3).states.upside_down_bit, 1);
  assert.equal(rotateStates("minecraft:oak_stairs", { weirdo_direction: 3 }, 3).states.weirdo_direction, 1);

  // 階段の向き・トラップドア・はしご・額縁・松明・原木軸
  assert.equal(rotateStates("minecraft:spruce_trapdoor", { direction: 3, open_bit: 1 }, 1).states.direction, 0);
  assert.equal(rotateStates("minecraft:ladder", { facing_direction: 2 }, 1).states.facing_direction, 5);
  assert.equal(rotateStates("minecraft:frame", { facing_direction: 3 }, 1).states.facing_direction, 4);
  assert.equal(rotateStates("minecraft:torch", { torch_facing_direction: "top" }, 1).states.torch_facing_direction, "top");
  assert.equal(rotateStates("minecraft:torch", { torch_facing_direction: "east" }, 1).states.torch_facing_direction, "south");
  assert.equal(rotateStates("minecraft:chest", { "minecraft:cardinal_direction": "west" }, 1).states["minecraft:cardinal_direction"], "north");
  assert.equal(rotateStates("minecraft:stripped_oak_log", { pillar_axis: "x" }, 1).states.pillar_axis, "z");
  assert.equal(rotateStates("minecraft:stripped_oak_log", { pillar_axis: "x" }, 2).states.pillar_axis, "x");
  assert.equal(rotateStates("minecraft:stripped_oak_log", { pillar_axis: "y" }, 1).states.pillar_axis, "y");

  // 未対応の向き状態は誤配置せず拒否する
  assert.ok(rotateBlueprint({ size: { x: 1, y: 1, z: 1 }, blocks: [{ x: 0, y: 0, z: 0, id: "minecraft:x", states: { mystery_direction: 1 } }] }, 1).error);

  // 使用地点は手前の右隅。奥(向いている方向)・左へ広がり、使用地点は囲いの外に残る
  const size = { x: 4, y: 1, z: 6 };
  const click = { x: 100, z: 100 };
  const cases = [
    [{ x: 0, z: -1 }, { x: 97, z: 93 }], // 北向き: 奥は -z、左は -x
    [{ x: 0, z: 1 }, { x: 100, z: 102 }], // 南向き: 奥は +z、左は +x
    [{ x: 1, z: 0 }, { x: 102, z: 95 }], // 東向き: 奥は +x、左は -z (回転後の size は呼び出し側で入れ替わる)
    [{ x: -1, z: 0 }, { x: 95, z: 100 }] // 西向き: 奥は -x、左は +z
  ];
  for (const [facing, expected] of cases) {
    const o = placeOriginAhead(click, facing, size);
    assert.deepEqual(o, expected, JSON.stringify(facing));
    // 囲い(1 ブロック外側)にも使用地点は含まれない
    const w = facing.x !== 0 ? size.z : size.x, d = facing.x !== 0 ? size.x : size.z;
    const inside = (c) => c.x >= o.x - 1 && c.x <= o.x + (facing.x !== 0 ? d : w) && c.z >= o.z - 1 && c.z <= o.z + (facing.x !== 0 ? w : d);
    assert.ok(!inside(click), "使用地点が囲いの中");
  }

  console.log("rotation tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
