#　マイクラめも
## 実行環境
- Minecraft v26.52
- Bedrock Edition / 通常の Minecraft の実行環境で確認

## 互換性メモ
- 本体バージョン `v26.52` を基準にし、互換対象を `[1, 26, 0]` として扱う
- `format_version` と `min_engine_version` は `[1, 26, 0]` を使用する
- `custom_components` は実行環境との互換性に不安があるため、利用前に Bedrock 本体の API 仕様を確認する
- `@minecraft/server` の依存バージョンは、実環境が提示する利用可能バージョンに合わせて設定する
- `world.beforeEvents` は runtime によって未定義になるため、script API の有無をログで確認する
- `world.events.tick` はこの実行環境では未定義であり、`system.runInterval(...)` を使うべきである
- `minecraft:tick` は block の更新処理に使えるが、script 側のイベントと依存する API の整合が必要
- 互換性の最終判断は、Minecraft のログ（`Scripting` / `Blocks`）で実際に runtime が提示する API を確認してから行う

## manifest.json で指定できる @minecraft/server モジュールの利用可能バージョンは以下の通りです。
### 1. 安定版（Stable API）の基本方針
- 対象: マイクラ本体 `v26.52` と連動する前提
- 使用中の指定: "2.1.0"（安定版の前提値）

特徴: 実験的機能をオフにした通常のワールドや配信向けアドオンで比較的安全に動作しやすい安定版として扱う。

### 補足
- ここでの "2.1.0" は、現在の作業環境での安定版前提の指定として扱う
- 実際に `@minecraft/server` が `2.10.0` に promote されることがあるため、ログ確認は必須
- 実際に `world.beforeEvents` や `registerCustomComponent` が使えるかは、Minecraft の起動ログで判定する
- 互換基準は `format_version` / `min_engine_version` の `[1, 26, 0]` を最優先にする
- ただし、API 仕様と runtime の実態が一致しない場合は、`system.runInterval(...)` などの安全な互換パターンへ切り替える

## 実装メモ
- 土のハーフブロックは通常の土→草ブロックの変化条件と同じ条件で育つようにする
- 草の成長判定は、以下を確認する
  - 上のブロックが空気である
  - 上部に十分な明るさがある
  - 近くに草ブロックや同系の成長元がある
- ブロック置換は `BlockPermutation.resolve(...)` を使う形に揃える
- スクリプト側の `registerCustomComponent` と block JSON の定義は、エラーが出ない組み合わせで維持する

### 土のハーフブロックが草のハーフブロックに変化する成功条件（実証済み）
実機環境（Minecraft v26.52 / Script API promoted to 2.10.0）で動作確認が取れた成長・変換の成立条件：

1. **対象ブロック**
   - 設置されているブロックが `nonax:dirt_slab` であること
2. **上部の空間条件**
   - 直上（`y + 1`）のブロックが `minecraft:air` であること（不透過ブロック等で覆われていないこと）
3. **光量条件（バニラ準拠）**
   - 直上位置の光量（`dimension.getLightLevel({ x, y: y + 1, z })`）が **9 以上** であること（日光または松明などの光源）
4. **隣接する草ブロック源（伝播元）**
   - 水平方向（東西南北 1 ブロック以内）に以下のいずれかのブロックが存在すること：
     - `minecraft:grass`
     - `minecraft:grass_block`
     - `minecraft:mycelium`
     - `nonax:grass_slab`（草ハーフ同士の連鎖・広がりも対応）
5. **ブロック変換 API の仕様**
   - `block.setPermutation(BlockPermutation.resolve("nonax:grass_slab"))` を呼び出すこと
   - ※ `dimension.setBlock(...)` は当 runtime では未定義（TypeError となるため使用不可）
6. **実行ループと成長インターバル（バニラ仕様準拠の確率判定）**
   - 以前は判定毎に100%即座に変化していたため、設置直後に即草化していた
   - バニラのランダムティック速度を模倣するため、確率判定を導入：
     - チェック周期: 1秒（20 ticks）ごと
     - 判定確率: 隣接する草ブロック1つにつき **4% / 秒**（上限 15%）
     - 平均所要時間: 草が隣に1つの場合で **約25秒**、四方を草で囲まれている場合で **約7〜10秒**
     - これにより「置いてすぐ変わる」不自然さを解消し、バニラの草伝播と同等の自然な時間感覚を実現
   - スキャン範囲もプレイヤー足元（Y=0）固定から、上下1段（Y: -1 ~ +1）および段差伝播に対応

### 草のハーフブロックの破壊・ドロップ仕様（シルクタッチ対応）
- 設置された草のハーフブロック（`nonax:grass_slab`）を破壊したときのドロップ制御：
  - ブロック定義側：`blocks/grass_slab.json` に `"minecraft:loot": "loot_tables/blocks/grass_slab.json"` を指定し、空の loot table（`"pools": []`）を設定してバニラ本体の自動ドロップを無効化。
  - スクリプト側：`world.afterEvents.playerBreakBlock` で破壊を検知。
    - プレイヤーがクリエイティブモードの場合はアイテムをドロップしない。
    - 破壊した道具（`itemStackBeforeBreak`）に `silk_touch` が付与されている場合：`nonax:grass_slab` をドロップ。
    - シルクタッチが付いていない（素手・通常ツール等）場合：`nonax:dirt_slab` をドロップ。
  - アイテムの生成は `system.run` 内で `dimension.spawnItem(new ItemStack(dropId, 1), dropLocation)` を実行。

### ハーフブロックの重ね設置による標準土ブロック化仕様
- `nonax:dirt_slab` または `nonax:grass_slab` の上に、`nonax:dirt_slab` または `nonax:grass_slab` を設置した場合：
  - スクリプト側：`world.afterEvents.playerPlaceBlock` でブロック設置を検知。
  - 設置されたブロックの直下（`y - 1`）が `nonax:dirt_slab` または `nonax:grass_slab` であるかを判定。
  - 条件を満たした場合、`system.run` 内で以下を実行：
    - 直下のハーフブロックを `BlockPermutation.resolve("minecraft:dirt")` で標準の土ブロックに置換。
    - 上に設置されたハーフブロックを `BlockPermutation.resolve("minecraft:air")` で空気に戻し、1つのフルブロックとして一体化。
  - サバイバルモードでは設置時に手元のハーフブロックが1つ消費されているため、下のハーフブロック（0.5）＋手元のハーフブロック（0.5）＝標準土ブロック（1.0）としてアイテム数・体積ともに整合。

## デバッグ時のメモ
- 失敗時は log の `Scripting` と `Blocks` を優先して確認する
- `Blocks` の `child 'custom_components' not valid here` は JSON 仕様違反の確認ポイント
- `Scripting` の `TypeError: cannot read property 'subscribe' of undefined` は script API の未対応・バージョン不一致の確認ポイント
- `Scripting` の `TypeError: cannot read property 'tick' of undefined` は `world.events.tick` を使っている場合に出る互換性エラーの確認ポイント
- `Scripting` の `TypeError: not a function` は API の呼び出し形式が実行環境とズレている場合の確認ポイント
  - 例1: `dimension.getBlockLightLevel()` / `dimension.getSkyLightLevel()` は `Dimension` には存在せず、`dimension.getLightLevel()` を使うべき
  - 例2: `dimension.setBlock()` は存在せず、`block.setPermutation(BlockPermutation.resolve(...))` または `dimension.setBlockPermutation()` を使うべき
- `manifest.json` の `module_name: '@minecraft/server'` と `version` は最重要の整合確認項目
- 互換性が崩れた場合は、`world.beforeEvents` / `world.events.tick` / `system.runInterval` のどれがこの runtime で使えるかを必ず確認する

## 追加予定
- クリエイティブ内での確認手順
- テスト用の設置場所と確認シナリオ
- grass slab と dirt slab の見た目確認リスト
- レシピとテクスチャの再確認メモ
