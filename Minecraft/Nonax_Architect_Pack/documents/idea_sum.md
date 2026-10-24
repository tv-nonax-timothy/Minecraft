# 棟梁（Architect）職業アドオン - アイデアまとめ

## 📋 プロジェクト概要

**目標**: マイクラ Bedrock Edition の村人システムに新しい職業「棟梁（Architect）」を追加し、建築作業を便利・楽しくするパートナーとして実装する。

### ⚠️ 技術的制約（Minecraft_memo.md より）
- **実行環境**: Minecraft v26.52 / Bedrock Edition
- **互換基準**: `format_version: [1, 26, 0]`, `min_engine_version: [1, 26, 0]`
- **安定版 API**: `@minecraft/server` 2.1.0（ログ確認必須、2.10.0 に promote される可能性あり）
- **未定義 API**: 
  - ❌ `world.events.tick` → ✅ `system.runInterval(...)` で代替
  - ❌ `dimension.setBlock()` → ✅ `block.setPermutation(BlockPermutation.resolve(...))` または `dimension.setBlockPermutation()`
  - ⚠️ `custom_components`: 実行環境との互換性に不安あり、利用前に Bedrock 本体の API 仕様を確認

---

## 🎯 1. コンセプト・世界観

### 基本設定
- **職業名**: 棟梁（Architect / Master Builder）
- **キャラクター像**: 建築や大工仕事のプロフェッショナル。職人肌で、建築資材の調達や加工、特別な建築ノウハウを提供する。
- **テーマ**: 「建築作業を便利に・楽しくするパートナー」

### キャラクターデザイン案
- はちまき、職人風のエプロン、腰に道具袋を下げたスタイルなど、「日本の棟梁」らしい見た目
- 建築資材の調達や加工、特別な建築ノウハウを提供できる専門家

---

## 🏗️ 2. システム全体像

### 建築ギミックの核心
**「設計図を使うと、使った場所を起点に、棟梁がブロックを 1 個 1 個積み上げて建築していく」**

#### 建築フロー（4 ステップ）
```
[1. 設計図の設置] 
      ↓
[2. 現場の準備（足場・囲い・看板の自動生成）]
      ↓
[3. 棟梁の入場＆着工（1 ブロックずつ設置＋SE/演出）]
      ↓
[4. 棟梁の退場＆解体（足場・囲いの自動撤去）]
```

### ⚙️ 技術実装のポイント（Minecraft_memo.md 準拠）

#### ブロック置換処理
- ✅ **推奨**: `block.setPermutation(BlockPermutation.resolve("ブロック ID"))`
- ❌ **禁止**: `dimension.setBlock(...)` は未定義（TypeError となるため使用不可）

#### タイマー処理
- ✅ **推奨**: `system.runInterval(...)` で安全なタイマー処理
- ❌ **禁止**: `world.events.tick` は未定義

#### イベント処理
- ✅ **推奨**: `world.beforeEvents.playerInteractWithBlock`（設置前インターセプト）
- ⚠️ **注意**: `world.afterEvents.playerPlaceBlock` はフォールバックとして併用可能

---

## 📜 3. ランクシステムと設計図

### レベルごとの設計図解放

| ランク | 称号 | 設計図テーマ | 建築スケール | 特徴 |
|--------|------|-------------|-------------|------|
| **Lv.1** | 見習い棟梁 | 小型小物・基礎設備 | ポスト、ベンチ、井戸、街灯、作業用テント | 数十秒〜1 分程度でサクッと完成 |
| **Lv.2** | 一人前 | 実用的な小建築 | 小型倉庫、見張り台（櫓）、釣り小屋、橋 | 足場を組み始めて「建築現場」っぽさ |
| **Lv.3** | 熟練 | 生活・生産拠点 | 日本伝統の民家、大工の作業場、風車・水車小屋 | 2 階建てなど少し立派な建物 |
| **Lv.4** | 名人 | 大型施設・防衛拠点 | 豪華な邸宅、城門・立派な門構え、大浴場 | かなり大きな建築。長時間の工事 |
| **Lv.5** | 達人 | シンボル・大作 | 五重の塔、天守閣のベース、広大な神社・寺院 | 棟梁の集大成！ランドマーク級建築 |

### 演出の変化（レベルアップに伴う）

- **Lv.1〜2**: 棟梁が 1 人でトントンと数分で仕上げる
- **Lv.4〜5**: 
  - 周囲に「立入禁止の囲い」や「竹・丸太の足場」が組み上がる
  - 完成までにゲーム内で 1〜2 日かかるような本格的工事
  - 「見習い大工（助手 NPC）」を連れてくる演出も可能

---

## 🛠️ 4. 建築マーカー＆足場システム（パターン A）

### システムフロー

```
[設計図使用] → [足場・囲いの自動生成] → [棟梁が作業] → [完成] → [足場の自動撤去]
```

#### Step 1: 建築マーカーと現場準備
- 設計図アイテムを地面に右クリック（長押し）で「建築の起点」と「完成予想のガイド」を表示
- 建築エリアの外周に竹の足場や木の柵（ロープ囲い）、夜間作業用の松明・ランタンが自動設置

#### Step 2: 棟梁の駆けつけと工事
- 棟梁（＋ランクが高ければ弟子 NPC）がマーカーの場所までトコトコ歩いてくる
- 足場を登ったり移動しながら、建物のブロックを**1 個ずつトントンと設置**していく
- ブロックを置くたびに「カン！カン！」という木工音や木くずのパーティクルが発生

#### Step 3: 完成と現場の撤去（クリーンアップ）
- 最後の 1 ブロックが置き終わると、棟梁が決めポーズ
- **周りの足場・囲い・看板がシュッと自動で消滅**し、完成したピカピカの建物だけが残る

### 技術実装ポイント（Minecraft_memo.md 準拠）

#### 足場データの自動計算
```javascript
// 推奨: system.runInterval で非同期処理
system.runInterval(() => {
    // 建物のサイズを取得し、「一回り外側」に足場ブロックを配置
    const scaffoldingBlocks = calculateScaffolding(buildingBounds);
    for (const block of scaffoldingBlocks) {
        dimension.setBlockPermutation(block.position, 
            BlockPermutation.resolve("minecraft:scaffolding"));
    }
}, 1000); // 1 秒ごとにチェック
```

#### ブロック設置処理（1 個ずつ）
```javascript
// 推奨: block.setPermutation で置換処理
system.runInterval(() => {
    const nextBlock = buildingList.pop();
    
    // 足場ブロックの撤去も同時に実行
    if (isScaffolding(nextBlock.position)) {
        dimension.setBlock(nextBlock.position, "minecraft:air");
    }
    
    // 本物のブロックを設置（置換処理）
    block.setPermutation(BlockPermutation.resolve(nextBlock.id));
}, 1000); // 1 秒間に 1 ブロックペース
```

#### 完成時のクリーンアップ
```javascript
// 建築完了時に一括撤去
function cleanupConstructionSite(scaffoldingCoordinates) {
    for (const coord of scaffoldingCoordinates) {
        dimension.setBlockPermutation(coord, "minecraft:air");
    }
}
```

---

## 🎨 5. 取引システム

### ランク別取引アイテムイメージ

| レベル | ランク | 取引アイテムのイメージ | メリット・狙い |
|--------|------|---------------------|---------------|
| **Lv.1** | 見習い棟梁 | 木材・丸太の買い取り／各種ハーフブロックや階段などの大量取引 | 序盤の伐採作業の手間をエメラルドで解消、資材集めの効率化 |
| **Lv.2** | 一人前 | 柵、ゲート、ドア、トラップドア、ガラス、足場などの建築用パーツ | 建築で大量に使う小物をまとめて入手可能に |
| **Lv.3** | 熟練 | レンガ、クォーツ、深層岩タイル、テラコッタ、コンクリート等の加工資材 | 高級・特殊な建築資材の安定供給 |
| **Lv.4** | 名人 | 建築に役立つツール（効率強化や耐久力がついた斧・ピック、足場ブロック等） | 建築作業そのものを快適にするギアの提供 |
| **Lv.5** | 達人 | **特別アイテム**（例：建築家の設計図、特製ブロック、珍しい光源など） | 最高ランクならではのロマン枠 |

---

## 💡 6. 棟梁ならではの「特別な要素」アイデア集

### アイデアリスト

1. **「建築の設計図（Blueprint）」を取引**
   - 特定の素材と一緒にクラフト（または使用）すると、一瞬で小さな構造物ができる

2. **建材のダウングレード・相互変換**
   - 余った階段やハーフブロックを棟梁に渡すと元のフルブロックに戻してくれる

3. **建築用特殊ツールの販売**
   - 一括破壊ツールや、広い範囲を塗れるペンキブラシ（アドオン独自アイテム）など

4. **見た目・テクスチャ**
   - はちまき、職人風のエプロン、腰に道具袋を下げたスタイルなど

---

## 🎬 7. 演出・ロマンを深めるアイデア

### 追加演出案

1. **建設現場の「足場」と「囲い」**
   - 建築が始まると、周りに竹や木の足場ブロックが自動で組み上がる

2. **作業中の大工効果音（SE）とパーティクル**
   - ブロックを置く瞬間に「カン！カン！」という木工音や木くずのパーティクル

3. **資材の要求（リアリティ重視の場合）**
   - 設計図を使う際、近くのチェストに「原木 50 個、丸太 20 個」などを入れておかないと棟梁が「資材が足りない！」と作業を止めるギミック

4. **建築アニメーション**
   - 腕を振る動作や、ブロックを置くモーションを再生

---

## 🏠 8. 棟梁に建てさせたい建物のアイデアリスト

### 小型・基礎（Lv.1〜2）
- ポスト、ベンチ、井戸、街灯、作業用テント
- 小型倉庫、見張り台（櫓）、釣り小屋、橋

### 生活・生産拠点（Lv.3）
- 日本伝統の民家、大工の作業場、風車・水車小屋

### 大型施設・防衛拠点（Lv.4〜5）
- 豪華な邸宅、城門・立派な門構え、大浴場
- 五重の塔、天守閣のベース、広大な神社・寺院

---

## 🌐 9. データ共有システム（Web ツール連携）

### ビジョン
**「プレイヤーがマイクラ内で作った建物を設計図として書き出し、サイトに投稿してプレイヤー同士で共有。そして別のプレイヤーが棟梁を雇ってその建物を自分の世界でトントンと建ててもらう」**

### データ連携フロー

```
【マイクラ内】
1. 自分の世界で建物を建てる
2. スクリプト（または構造ブロック）で建物のブロック配置データを「テキストデータ（JSON）」として書き出す
   ↓
【Web サイト (TV のなっくすの道具箱)】
3. サイトの「設計図共有ページ」にデータを貼り付けて投稿・共有！
4. 欲しい設計図を選び、データ（またはアドオン用パック）として取得
   ↓
【マイクラ内】
5. 自環境のアドオンに組み込む（またはコマンド/ツールで読み込む）
6. 棟梁が 1 ブロックずつ現場で組み立てる！
```

### 技術的実現方法

#### マイクラ内からの「データの書き出し（キャプチャ）」
- `StructureManager` または `getBlock` のスキャン処理を使えば、指定した範囲のブロック配置データを JSON 形式として出力可能
- **推奨**: `system.runInterval` で非同期スキャン処理

#### Web ツールでの受け皿
- 「設計図投稿・変換ツール」を用意し、プレイヤーがマイクラで書き出したテキストデータ（JSON）をサイトに貼り付けるだけ
- サイト側で建物のプレビュー（3D 表示やブロックリスト）を表示

#### ゲーム内への取り込み方法
- **方法 A**: アドオン同梱（パックアップデート型） - `.mcpack` を自動生成してダウンロード・適用
- **方法 B**: ゲーム内テキスト入力（Clipboard / クリップボード読み込み型） - `ModalFormData` に設計図コードを貼り付けて登録

---

## 📁 10. ファイル構造案

### behavior_pack 構成

```
behavior_pack/
├── manifest.json              # パック定義
│   ├── format_version: "1"
│   ├── header: {
│   │   ├── name: "Architect Villager Pack"
│   │   ├── uuid: "..."        # UUID を生成
│   │   ├── version: [0, 0, 1]
│   │   └── min_engine_version: [1, 26, 0]
│   ├── modules: [
│   │   ├── { type: "data", uuid: "...", version: [0, 0, 1] }
│   │   └── { type: "client_data", uuid: "...", version: [0, 0, 1] }
│   │   }
│   └── dependencies: [
│       ├── { uuid: "@minecraft/server", version: ["2", "1", "0"] }
│       └── { uuid: "@minecraft/server-net", version: ["1", "3", "0"] } // 必要なら
│       ]
│
├── data/
│   ├── villager_professions/
│   │   └── architect.json     # 棟梁職業定義（POI ブロック指定）
│   ├── loot_tables/
│   │   └── villager_trades/   # 棟梁の取引テーブル（ランク別）
│   └── scripts/
│       └── main.js            # 建築スクリプト（設計図処理・足場設置など）
│           ├── architect_builder.js   // 1 ブロックずつ設置ロジック
│           ├── scaffolding_system.js  // 足場自動生成・撤去処理
│           └── cleanup_system.js      // 完成時のクリーンアップ処理
│
├── client_data/
│   ├── models/
│   │   └── villager/          # 棟梁の村人モデル定義
│   │       └── architect.geo.json
│   └── textures/
│       └── villager/architect/ # 棟梁のテクスチャ（はちまき・エプロンなど）
│           ├── entity.png
│           └── animations.json
│
└── scripts/
    └── main.js                 // メインスクリプト（イベント処理）
        ├── playerInteractWithBlock  // 設計図使用処理
        └── villagerEvents       // 村人関連イベント
```

### resource_pack 構成

```
resource_pack/
├── manifest.json              # パック定義
│   ├── format_version: "2"
│   ├── header: {
│   │   ├── name: "Architect Resource Pack"
│   │   ├── uuid: "..."
│   │   ├── version: [0, 0, 1]
│   │   └── min_engine_version: [1, 26, 0]
│   └── modules: [
│       └── { type: "resources", uuid: "...", version: [0, 0, 1] }
│       ]
│
├── textures/
│   ├── terrain_texture.json   # ブロックテクスチャ登録
│   ├── items/                 # アイテムテクスチャ（設計図など）
│   └── villager/architect/    # 棟梁の村人テクスチャ
│       └── entity.png         # 全体テクスチャ
│
├── models/
│   └── villager/architect/    # 棟梁のモデル定義
│       └── architect.geo.json # 職業ブロック・村人モデル
│
├── sounds/
│   ├── architect_work/        # 建築音（カン！カン！など）
│   │   ├── place_wood.ogg     # 木を置く音
│   │   ├── place_stone.ogg    # 石を置く音
│   │   └── tool_hit.ogg       # 工具の音
│   └── architect/             # 棟梁の声（「よし！」「取りかかるぞ！」など）
│
├── ui/
│   └── forms/                 # UI フォーム定義（設計図入力画面など）
│
└── texts/
    ├── ja_JP.lang             # 日本語テキスト
    └── en_US.lang             # 英語テキスト
```

---

## 🔧 11. 技術的制約と対応策（Minecraft_memo.md 準拠）

### マイクラ Bedrock の制限と代替策

| 制限 | 問題点 | 推奨解決策 |
|------|--------|-----------|
| ❌ `world.events.tick` | 未定義（TypeError） | ✅ `system.runInterval(...)` で代替 |
| ❌ `dimension.setBlock()` | 未定義（TypeError） | ✅ `block.setPermutation(BlockPermutation.resolve(...))` または `dimension.setBlockPermutation()` |
| ⚠️ `custom_components` | 互換性に不安 | ✅ Bedrock 本体の API 仕様を確認してから使用 |
| ❌ `minecraft:tags` | `format_version: 1.26.0` でエラー | ✅ タグ機能は使用不可、手動設定のみ |
| ❌ `item_specific_speeds` | 実験機能が必要 | ✅ `seconds_to_destroy` で採掘速度調整 |

### 推奨実装アプローチ（安定版 API）

**スクリプト API（TypeScript/JavaScript）を使う【推奨】**
- `system.runInterval` でタイマー処理（1 秒ごとにチェック）
- `block.setPermutation(BlockPermutation.resolve(...))` でブロック置換
- `villager.navigateTo()` で移動制御
- `dimension.spawnItem()` でアイテム生成

### デバッグ時の確認ポイント

```javascript
// 互換性確認ロジック（起動時実行推奨）
function checkRuntimeCompatibility() {
    const runtimeInfo = {
        hasBeforeEvents: typeof world.beforeEvents !== 'undefined',
        hasTickEvent: typeof world.events.tick !== 'undefined',
        hasSetBlock: typeof dimension.setBlock !== 'undefined'
    };
    
    console.log("Runtime Info:", runtimeInfo);
    
    // 互換性エラーの回避
    if (!runtimeInfo.hasBeforeEvents) {
        // beforeEvents が使えない場合はフォールバック処理
    }
}

// 実行場所：scripts/main.js の初期化部分
checkRuntimeCompatibility();
```

### ログ確認ポイント（ContentLog）

- **Scripting**: スクリプトエラー、API 未定義のエラー
- **Blocks**: ブロック定義エラー、JSON 仕様違反
- **互換性チェック**: 
  - `child 'custom_components' not valid here` → JSON 仕様違反
  - `TypeError: cannot read property 'subscribe' of undefined` → script API の未対応・バージョン不一致
  - `TypeError: cannot read property 'tick' of undefined` → `world.events.tick` を使用している場合

---

## 🎯 12. 次のステップ

### 優先順位の高いタスク（Minecraft_memo.md 準拠）

1. **設計図データ構造の定義** - シンプルな JSON フォーマットを決定
   - `format_version: [1, 26, 0]` を基準に互換性を確保
   
2. **建築スクリプトの実装** - 1 ブロックずつ設置するロジック作成
   - ✅ `block.setPermutation(BlockPermutation.resolve(...))` で置換処理
   - ❌ `dimension.setBlock()` は使用不可（フォールバックのみ）
   
3. **足場システムの開発** - 自動生成・撤去処理の実装
   - ✅ `system.runInterval` で非同期処理
   
4. **棟梁職業ブロックの設計** - POI ブロックの定義
   - 既存の村人職業システムとの互換性を確認
   
5. **取引テーブルの作成** - ランク別アイテム設定
   - `loot_tables/villager_trades/architect_lv1.json` など

### 具体的な建物リスト選定

- Lv.1〜5 で実際に作らせたい建物の具体化
- 各ランクの建築サイズ・複雑度の決定

---

## 📝 まとめ

この「棟梁」職業アドオンは、単なる取引システムを超えた**「建築体験そのものをエンターテインメント化する」**という革新的なコンセプトを持っています。

特に以下の点が特徴的です：

✅ **1 ブロックずつ積み上げる演出** - 圧倒的なロマンと生活感
✅ **足場・囲いの自動設置・撤去** - 工事現場のリアル感
✅ **ランクシステムによる成長** - プレイヤーへのインセンティブ
✅ **Web ツールとの連携** - コミュニティ共有の可能性

### ⚠️ 重要な技術的注意点（Minecraft_memo.md より）

1. **互換性基準**: `format_version: [1, 26, 0]` を最優先
2. **安定版 API**: `@minecraft/server` 2.1.0（ログ確認必須）
3. **未定義 API の回避**: 
   - ❌ `world.events.tick` → ✅ `system.runInterval(...)`
   - ❌ `dimension.setBlock()` → ✅ `block.setPermutation()` または `dimension.setBlockPermutation()`
4. **ログ確認**: ContentLog の `Scripting` と `Blocks` を常に監視


