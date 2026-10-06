#　マイクラめも
## 実行環境
- Minecraft v26.52
- Bedrock Edition / 通常の Minecraft の実行環境で確認

### 実機テスト用の設置場所
- "C:\Users\shini\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs"
- "C:\Users\shini\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang\development_resource_packs"

人による実機テストが必要な場合は、上記にコピーしてから、依頼すること。

**コードやリソースを修正したら、検証後に必ず上記2つのフォルダへ配置（`behavior_pack\Nonax_Building_Pack` と `resource_pack\Nonax_Building_Pack` をそれぞれ上書きコピー）すること。**

## 互換性メモ
- 本体バージョン `v26.52` を基準にし、互換対象を `[1, 26, 0]` として扱う
- `format_version` と `min_engine_version` は `[1, 26, 0]` を使用する
- `custom_components` は実行環境との互換性に不安があるため、利用前に Bedrock 本体の API 仕様を確認する
- `@minecraft/server` の依存バージョンは、実環境が提示する利用可能バージョンに合わせて設定する
- `world.beforeEvents` は runtime によって未定義になるため、script API の有無をログで確認する
- `world.events.tick` はこの実行環境では未定義であり、`system.runInterval(...)` を使うべきである
- `minecraft:tick` は block の更新処理に使えるが、script 側のイベントと依存する API の整合が必要
- 互換性の最終判断は、Minecraft のログ（`Scripting` / `Blocks`）で実際に runtime が提示する API を確認してから行う
- `C:\MyProject\Minecraft\bedrock-samples-v1.26.50.4-full`に統合版バニラのサンプルをダウンロードしてあります。

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

### 新規ブロックをクリエイティブの建築タブへ表示
- `behavior_pack/Nonax_Building_Pack/blocks/*.json` の `minecraft:block.description` に、`menu_category` を追加する。
  - 建築タブに表示する場合: `"menu_category": { "category": "construction" }`
- `menu_category` は `minecraft:block.components` ではなく `description` 内に置く。
- テスト用など一覧に出さないブロックは `menu_category` を追加しない。今回の確認では `test_slab.json` を除く11ブロックを建築カテゴリに登録し、JSON検証後に一覧への追加を確認。
- 実機で一覧に出ない場合は、resource packではなくbehavior pack側のブロック定義が読み込まれているかも確認する。

### 草レイヤーブロック
- `nonax:grass_layer` は `nonax:layers` state で厚さ2 / 4 / 6ピクセルを切り替える。上面を同じブロックで操作すると、最大3層まで増える。
- 草色の自動適用には、草ハーフブロックと同じ `custom_grass_top` / `custom_grass_side_ppl` テクスチャと `tint_method: "grass"` を使う。
- `minecraft:grass_block` 1個から2個を作成し、草ブロックでレシピをアンロックする。破壊時のドロップを防ぐため、空の loot table を指定する。
- クリエイティブ一覧は `menu_category.category: "nature"` に登録する。
- 実機で確認済みの成功条件:
  - 同じブロックの上面に重ねると 2 → 4 → 6ピクセルへ増え、ログに `Scripting` のエラーが出ない。
  - サバイバルで手持ちが1個のときもエラーなく消費される。`ItemStack.amount` は 1〜255 のため 0 を設定できず、残り1個は `setItem(slot, undefined)` で空にする。

### 石材・土砂レイヤーブロック
- `nonax:cobblestone_layer`、`nonax:mossy_cobblestone_layer`、`nonax:sandstone_layer`、`nonax:granite_layer`、`nonax:diorite_layer`、`nonax:andesite_layer`、`nonax:gravel_layer`、`nonax:sand_layer`、`nonax:smooth_stone_layer`、`nonax:clay_layer`、`nonax:red_sand_layer`、`nonax:red_sandstone_layer`、`nonax:tuff_layer`、`nonax:deepslate_layer`、`nonax:calcite_layer`、`nonax:rooted_dirt_layer`、`nonax:coarse_dirt_layer`、`nonax:podzol_layer`、`nonax:mycelium_layer` の19種類を追加。
- すべて `nonax:layers` state 1〜7に対応し、厚さはstate×2ピクセル（2〜14ピクセル）。同じ種類のブロックを上面に重ねると1層増え、7層が上限。草レイヤーは従来どおり3層上限。
- バニラサンプルの各ブロック画像を `textures/nonax/blocks/custom_*_layer*.png` に複製し、terrain atlasへ登録する。面ごとのtop/side画像があるブロックは対応する面へ割り当て、`tint_method` は使わない。
- 各元ブロック1個を作業台でshapelessレシピに使い、対応レイヤー8個を作成。元ブロックでレシピを解放し、`menu_category` は `nature`。
- 根付いた土のBedrock item IDは `minecraft:dirt_with_roots`（`minecraft:rooted_dirt` は無効）。レシピ材料とunlockの両方に同じBedrock IDを使う。
- 破壊時に何も落とさないよう、共有空loot table `loot_tables/blocks/layers_no_drop.json` を参照する。
- 重ね設置は `playerInteractWithBlock` で上面クリックを捕捉し、state更新後にサバイバルの手持ちを1個消費する。最大層到達時は設置をキャンセルしてアイテムを消費しない。

### 根付いた土レイヤーのレシピエラー解消（実機確認済み）
- Minecraft v26.52で、`rooted_dirt_layer` のレシピエラーが解消したことを実機確認済み。
- 原因の `minecraft:rooted_dirt` をBedrock正規IDの `minecraft:dirt_with_roots` に材料・unlock両方で修正した後、レシピエラーが出なくなった。

### 木材の塀10種
- バニラ板材のテクスチャを behavior pack / resource pack の名称と混同しないよう、`custom_` を付けて `resource_pack/Nonax_Building_Pack/textures/nonax/blocks/` に複製。
- `textures/terrain_texture.json` に各テクスチャを登録し、対応するカスタムブロックの `minecraft:material_instances` から参照。
- 追加ブロックIDとテクスチャ：
  - `nonax:acacia_wall` / `custom_acacia_planks`
  - `nonax:owk_wall` / `custom_oak_planks`
  - `nonax:jungle_wall` / `custom_jungle_planks`
  - `nonax:birch_wall` / `custom_birch_planks`
  - `nonax:dark_owk_wall` / `custom_dark_oak_planks`
  - `nonax:spruce_wall` / `custom_spruce_planks`
  - `nonax:mangrove_wall` / `custom_mangrove_planks`
  - `nonax:cherry_wall` / `custom_cherry_planks`
  - `nonax:pale_oak_wall` / `custom_pale_oak_planks`
  - `nonax:poplar_wall` / `custom_poplar_planks`
- 各レシピは指定の `###` / ` # ` / `###` の形で、対応する板材6枚から塀6個を作成し、板材を `unlock` 条件に設定。
- 表示名は resource pack の `texts/ja_JP.lang` と `texts/en_US.lang` に登録。
- ポプラ塀のレシピは `minecraft:poplar_planks` のみで解放し、完成数6。建築タブには `description.menu_category.category: "construction"` を指定し、接続スクリプトの `WALL_IDS` にもIDを登録する。
- **形状と接続の自動切替:** 各塀に `nonax:north/east/south/west` のboolean block stateを追加し、`minecraft:geometry.bone_visibility` から対応する4方向の腕を表示制御する。設置・破壊後に対象位置と東西南北の隣接塀のstateを再計算し、既存配置もプレイヤー周辺の周期走査で更新する。
- 上面図に合わせ、モデルは中央8×8pxと、各方向へ伸びる8px幅×4px長の腕で構成。パーツはY=0〜16pxで同じ高さ。`collision_box` / `selection_box` も高さ16px。
- 接続判定は空気・液体に加えて `WALL_CONNECTION_EXCLUDED_TYPES` の明示ID（`minecraft:leaf_litter` を含む）と `_slab` / `_carpet` / `_pressure_plate` / `_button` / `_trapdoor` / `_leaves` / `_flower` のsuffixを除外する。自動寸法判定ではなく、低いブロックが追加されたらこのリストへ追記する。
- **A軸方向の再発防止:** 塀の接続方向テーブルは、除外判定を追加する前に正常動作していた割当を維持する。現在の既存割当は `dx: 1` → `nonax:west`、`dx: -1` → `nonax:east`。接続除外を変更するときは `canWallConnectTo` の判定だけを編集し、`WALL_DIRECTIONS` の方向state割当を変更しない。
- **A軸方向の回帰確認:** 方向state割当は変更せず、東西それぞれに通常ブロックを隣接させて、除外判定追加前と同じ腕が表示されることを確認する。開発用behavior packへ同期し、ワールドを再読み込みして確認する。
- **斧での採掘（実験機能なし）:** `item_specific_speeds` は Upcoming Creator Features 実験が必要なため使用禁止。また、このパックの `format_version: 1.26.0` では `minecraft:tags` が実機ログで `child 'minecraft:tags' not valid here` となったため使用不可。塀は `seconds_to_destroy: 0.5` とし、実験や未対応tagに依存せず採掘を速くする（斧だけを個別に速くする設定ではない）。
- 材質別に1枚の板材テクスチャを全面へ引き伸ばさず、ジオメトリ面ごとのUVを指定する。上面のちらつき防止として、中央板と接続腕が体積的に重ならない形状にする。
- **形状上の制約:** バニラ石塀の専用ジオメトリはサンプルに含まれないため、`geometry.nonax_wall` は独自モデル。接続方向の切替は再現するが、バニラ石塀と細部まで同じ端点・角形状や接続規則ではない。ゲーム内の形状と当たり判定は実機確認が必要。
- 実機ログ `ContentLog2026-10-03_15-30-49_1.txt` で、`minecraft:selection_box` のY範囲上限は16と確認。塀の selection box は `[16, 16, 16]` にする（高さ24はエラー）。`minecraft:collision_box` は同ログで範囲エラーなし。

### ガラス塀
- ブロックIDは `nonax:glass_wall`、ジオメトリは木材塀と同じ `geometry.nonax_wall`。4方向stateと接続更新スクリプトの `WALL_IDS` に追加する。
- バニラの `resource_pack/textures/blocks/glass.png` を `textures/nonax/blocks/custom_glass.png` にコピーし、`textures/terrain_texture.json` に `custom_glass` を登録。
- ガラスの透過には `minecraft:material_instances` の `render_method: "blend"` を使う。`alpha_test` は使用しない。対象 `format_version` で未対応のlight-dampening等の追加コンポーネントは入れない。
- レシピはガラス8個を指定の `###` / ` # ` / `###` に並べ、ガラスでアンロック、ガラス塀6個を出力する。`description.menu_category.category` は `construction`。
- `ja_JP.lang` と `en_US.lang` の表示名キーは `tile.nonax:glass_wall.name`。

### ガラスのハーフブロック
- ブロックID `nonax:glass_slab`。`geometry.custom_half_slab` / `geometry.custom_half_slab_top` を使い、`minecraft:vertical_half` による上下配置とcollision/selection boxの切り替えを行う。
- 既存のバニラガラス複製画像を `textures/nonax/blocks/custom_glass_org.png` として使い、terrain atlasの `custom_glass_org` に登録する。`render_method: "blend"` で透過し、`alpha_test` は使わない。
- `menu_category` は `construction`。ガラス3個を横一列に置くレシピでガラススラブ6個を作成し、ガラスで解放する。
- `loot_tables/blocks/glass_slab.json` は空poolとし、シルクタッチなしではドロップしない。シルクタッチ時のガラススラブ1個はエンジン標準の破壊ドロップに任せ、`playerBreakBlock` から `spawnItem` しない（二重生成防止）。効率・幸運などを用いた手動の個数計算も行わない。既存の重ね置き変換処理は土・草スラブだけが対象のため、ガラススラブは標準ガラスへ変換しない。
- 採掘時間は `seconds_to_destroy: 0.3` とする。これは素早く壊すための時間設定で、入力回数を厳密に3回へ固定するものではない。
- 表示名キーは `tile.nonax:glass_slab.name`（英語 `Glass Half Slab`、日本語 `ガラスのハーフブロック`）。

### ガラスのハーフブロックの破壊増殖修正（実機確認済み）
- Minecraft v26.52で、シルクタッチ付きの道具でガラススラブ1個を破壊したとき、ガラススラブが1個だけドロップし、複数個へ増殖しないことを実機確認済み。
- 原因はエンジン標準のシルクタッチドロップに加え、`playerBreakBlock` スクリプトでも同じスラブを `spawnItem` していた二重生成。ガラススラブはスクリプトの手動ドロップ対象から外し、エンジン標準ドロップだけを使う。
- `loot_tables/blocks/glass_slab.json` は空poolに保ち、シルクタッチなしではドロップせず、シルクタッチ時はエンジン標準で1個を回収できること。
- 今後、ガラススラブの破壊処理へ手動 `spawnItem` を追加しない。変更後はシルクタッチで1個だけ回収されることを実機で再確認する。

### ガラスの階段
- ブロックID `nonax:glass_stairs`。`format_version: 1.26.0` とし、`minecraft:placement_direction` の `minecraft:cardinal_direction` および `minecraft:placement_position` の `minecraft:vertical_half` で方向・上下を決める。
- カスタムgeometryは北向き基準で、下付きは「下半分全面＋北側上半分」、上付きは「上半分全面＋北側下半分」の2箱構成。向きstateごとにY軸を0/90/180/-90度回転し、2個のcollision boxもgeometryと一緒に回転する。
- バニラサンプルのoak stairsレシピ（`###`形の3段配置）に合わせ、ガラス6個から `nonax:glass_stairs` 4個を作る。レシピshapeは上から `#  ` / `## ` / `###`、ガラスで解放する。
- `custom_glass_org` と `render_method: "blend"` を使い、`menu_category` は `construction`、採掘時間は `seconds_to_destroy: 0.3`。破壊時は空loot tableで非シルクタッチのドロップを抑え、シルクタッチ時はエンジン標準ドロップに任せる。`alpha_test` は使わない。
- `tile.nonax:glass_stairs.name` を英語 `Glass Stairs`、日本語 `ガラスの階段` とする。
- Vanilla blockshapeはcustom blockで利用できないため、ステップ形状は独自geometryで再現する。selection boxはカスタムcollision box配列と同じ段形状にはならず、単一の全体選択範囲となる。

### ガラスの階段の成功条件（実機確認済み）
- Minecraft v26.52のゲーム内で、ガラス階段が正常に動作することを確認済み。
- 下付き・上付きの両方で階段形状が表示され、設置方向に応じて高い側が奥になること。
- 階段状のcollision boxで移動・立ち止まりができ、通常ガラスの透明テクスチャが表示されること。選択範囲は仕様上ブロック全体。
- 作業台レシピでガラス6個から階段4個を作成でき、建築カテゴリに表示されること。
- シルクタッチで階段を回収でき、シルクタッチなしでは破壊されてアイテムをドロップしないこと。採掘時間は `seconds_to_destroy: 0.3`。
- `alpha_test` および実験的機能を使わずに動作すること。

### 木材の塀の成功条件（実機確認済み）
- Minecraft v26.52 / `@minecraft/server` runtime 2.10.0 で、9種の塀ブロックが読み込まれ、レシピとアンロックが機能すること。
- 対象ブロックをワールドに設置できること。桜の塀はレシピ・アンロック・設置を実機確認済み。
- 隣接ブロックの向きに合わせ、塀の該当する腕だけが表示されること。方向state割当は正常動作していた既存値（`dx: 1` → `nonax:west`、`dx: -1` → `nonax:east`）を維持する。接続除外の変更に方向割当の変更を混在させない。
- 上面図の形状は中央8×8px、東西南北の腕は幅8px・長さ4px。全パーツをY=0〜16pxに揃え、隣接時に隙間や不自然な重なりがないこと。
- 接続先の判定では空気・液体を除く隣接ブロックに接続できること。
- 実験機能を有効にしなくてもブロック定義エラーが出ないこと。`minecraft:tags` と `item_specific_speeds` は現行制約では使わず、`seconds_to_destroy: 0.5` で採掘しやすくする。
- Content Log に塀の `Blocks` 定義エラー、レシピの `missing or invalid` エラーがないこと。`Sound ... fly` のverbose行は塀定義エラーとは別扱い。

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

### ハーフブロックの重ね設置による即時土ブロック化仕様
- `nonax:dirt_slab` または `nonax:grass_slab` に対して、手持ちの `nonax:dirt_slab` または `nonax:grass_slab` を重ねて設置した場合：
  - 課題の解消：
    - 以前は `afterEvents.playerPlaceBlock` で上の空間（y+1）に一旦設置した後に消していたため、上の空間にブロックがあると設置できず、また一瞬上の空間にブロックが見える違和感があった。
    - これを解消するため、`world.beforeEvents.playerInteractWithBlock` による**設置前インターセプト**を導入。
  - 判定ロジック：
    - 下付きハーフブロック（`vertical_half == 'bottom'`）の上面（`Up`）または側面の上半分（`faceLocation.y >= 0.5`）をクリックした場合
    - 上付きハーフブロック（`vertical_half == 'top'`）の下面（`Down`）または側面の下半分（`faceLocation.y < 0.5`）をクリックした場合
  - 動作：
    - `event.cancel = true` で通常の別ブロック設置（y+1への配置）を完全にキャンセル。
    - `system.run` でクリックされたブロックそのものを `BlockPermutation.resolve("minecraft:dirt")` で即座に土ブロックに置換。
    - サバイバルモードでは手持ちのハーフブロックを1個消費（クリエイティブでは無消費）。
    - 設置音（`step.grass`）を再生。
    - 上にすでに別のブロックが存在していても、下付きハーフブロックをクリックすればその場で即座に土ブロックに一体化できる。
  - フォールバック：
    - 万が一のケースに備え、`world.afterEvents.playerPlaceBlock` による一体化処理もセーフティネットとして併用。

### 上付きハーフブロック（ブロック上8ピクセル）対応仕様
- バニラのハーフブロック同様、ブロックの上半分（上8ピクセル）にも張り付くよう対応：
  - ブロック定義側（`blocks/dirt_slab.json`, `blocks/grass_slab.json`）：
    - `"traits": { "minecraft:placement_position": { "enabled_states": ["minecraft:vertical_half"] } }` を追加。
    - プレイヤーの視線・クリック位置（ブロックの下面や側面上部など）に応じて、自動で `"minecraft:vertical_half"` state が `"bottom"` / `"top"` に設定される。
    - `permutations` にて、`q.block_state('minecraft:vertical_half') == 'top'` の場合の `collision_box`, `selection_box` を `origin: [-8, 8, -8]`、サイズ `[16, 8, 16]` に切り替え。
  - モデル側（`models/blocks/half_slab.json`, `models/blocks/grass_slab.json`）：
    - 上付き専用モデル `geometry.custom_half_slab_top`, `geometry.custom_half_grass_slab_top` を追加（origin: `[-8, 8, -8]`、pivot: `[0, 8, 0]`）。
  - スクリプト側（`scripts/main.js`）：
    - 土ハーフから草ハーフへの成長時（`tryGrowDirtSlab`）、`block.permutation.getState("minecraft:vertical_half")` を取得し、上付き・下付きの姿勢を維持したまま草ハーフブロックに変換。

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
