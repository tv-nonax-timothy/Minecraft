// 設計図の基準向きは「正面 = 北 (-Z)」。時計回り (北→東→南→西) に 90° 単位で回転する。
const COMPASS = ["north", "east", "south", "west"];
// weirdo_direction / トラップドアの direction: 0=東, 1=西, 2=南, 3=北
const WEIRDO_CW = { 0: 2, 2: 1, 1: 3, 3: 0 };
// facing_direction: 2=北, 3=南, 4=西, 5=東 (0/1 は下/上で不変)
const FACING_CW = { 2: 5, 5: 3, 3: 4, 4: 2 };

function shortName(id) {
  return String(id).replace(/^minecraft:/, "");
}

function cycle(map, value, turns) {
  let v = value;
  for (let i = 0; i < turns; i++) {
    if (!(v in map)) return v;
    v = map[v];
  }
  return v;
}

// 正面(北)をプレイヤー側へ向けるための時計回り回転数 (0-3) を返す。
// プレイヤーが南を向いて立てば正面(ドア)は北のまま、つまりプレイヤーの向きの逆を向く。
export function quarterTurnsFromFacing(facing) {
  if (Math.abs(facing.x) > Math.abs(facing.z)) return facing.x > 0 ? 3 : 1;
  return facing.z < 0 ? 2 : 0;
}

export function rotateStates(id, states, turns) {
  if (!states || turns === 0) return { states };
  const name = shortName(id);
  const result = { ...states };
  for (const key of Object.keys(states)) {
    const value = states[key];
    switch (key) {
      case "minecraft:cardinal_direction":
      case "torch_facing_direction": {
        const index = COMPASS.indexOf(value);
        if (index >= 0) result[key] = COMPASS[(index + turns) % 4];
        else if (key === "minecraft:cardinal_direction") return { error: `未対応の向きです (${name} ${key}=${value})` };
        break;
      }
      case "weirdo_direction":
        result[key] = cycle(WEIRDO_CW, value, turns);
        break;
      case "facing_direction":
      case "minecraft:facing_direction":
        result[key] = cycle(FACING_CW, value, turns);
        break;
      case "direction":
        if (name.endsWith("trapdoor")) result[key] = cycle(WEIRDO_CW, value, turns);
        else if (Number.isInteger(value)) result[key] = (value + turns) % 4; // 0=南, 1=西, 2=北, 3=東
        break;
      case "pillar_axis":
        if (turns % 2 === 1) result[key] = value === "x" ? "z" : value === "z" ? "x" : value;
        break;
      case "ground_sign_direction":
        if (Number.isInteger(value)) result[key] = (value + turns * 4) % 16;
        break;
      default:
        if (/direction|facing|rotation|orientation/.test(key) && !/^(upside_down|door_hinge)/.test(key)) {
          return { error: `未対応の向き状態です (${name} ${key}=${value})` };
        }
    }
  }
  return { states: result };
}

// 使用地点を「手前の右隅」とし、プレイヤーの向いている奥・左へ建物を広げたときの最小隅 (x, z) を返す。
// 使用地点と囲いの間に FRONT_MARGIN - 1 ブロックの空きを作り、使用者が囲いの中に入らないようにする。
export const FRONT_MARGIN = 2;
export function placeOriginAhead(click, facing, size) {
  const forward = Math.abs(facing.x) > Math.abs(facing.z)
    ? { x: Math.sign(facing.x), z: 0 }
    : { x: 0, z: facing.z < 0 ? -1 : 1 };
  const left = { x: forward.z, z: -forward.x };
  const depth = forward.x !== 0 ? size.x : size.z;
  const width = forward.x !== 0 ? size.z : size.x;
  const near = { x: click.x + forward.x * FRONT_MARGIN, z: click.z + forward.z * FRONT_MARGIN };
  const far = { x: near.x + forward.x * (depth - 1) + left.x * (width - 1), z: near.z + forward.z * (depth - 1) + left.z * (width - 1) };
  return { x: Math.min(near.x, far.x), z: Math.min(near.z, far.z) };
}

function rotatePosition(x, z, sizeX, sizeZ, turns) {
  switch (turns) {
    case 1: return { x: sizeZ - 1 - z, z: x };
    case 2: return { x: sizeX - 1 - x, z: sizeZ - 1 - z };
    case 3: return { x: z, z: sizeX - 1 - x };
    default: return { x, z };
  }
}

// 設計図の座標・寸法・ブロック状態を回転した新しい設計図を返す。元の設計図は変更しない。
export function rotateBlueprint(bp, turns) {
  turns = ((turns % 4) + 4) % 4;
  if (turns === 0) return { blueprint: bp, turns };
  const blocks = [];
  for (const block of bp.blocks) {
    const pos = rotatePosition(block.x, block.z, bp.size.x, bp.size.z, turns);
    const rotated = { ...block, x: pos.x, y: block.y, z: pos.z };
    if (block.states) {
      const result = rotateStates(block.id, block.states, turns);
      if (result.error) return { error: result.error };
      rotated.states = result.states;
    }
    blocks.push(rotated);
  }
  const size = turns % 2 === 1 ? { x: bp.size.z, y: bp.size.y, z: bp.size.x } : { x: bp.size.x, y: bp.size.y, z: bp.size.z };
  return { blueprint: { ...bp, size, blocks }, turns };
}
