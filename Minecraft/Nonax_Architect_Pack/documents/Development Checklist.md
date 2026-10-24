# 棟梁（Architect）アドオン実装チェックリスト

## 📌 Phase 1: 最小プロトタイプ構築（ローカル動作確認）
まずは手元の環境で「スクリプトから 1 ブロックずつ設置して足場が消える」動作を確認するフェーズです。

### 1-1. パック基本構成・マニフェスト作成
- [ ] **Behavior Pack (`behavior_pack/manifest.json`) の作成**
  - [ ] `min_engine_version: [1, 26, 0]` の設定
  - [ ] `@minecraft/server` (`2.1.0`) の依存関係追加
  - [ ] `format_version: "1"` の設定
- [ ] **Resource Pack (`resource_pack/manifest.json`) の作成**
  - [ ] `min_engine_version: [1, 26, 0]` の設定
  - [ ] `modules: [{ type: "resources" }]` の定義
- [ ] **開発環境（ComPacks / behavior_packs フォルダ等）への配置と統合テストワールドの作成**

### 1-2. 棟梁（村人）職業・POI ブロック定義
- [ ] **POI ブロック（棟梁の作業台）の作成**
  - [ ] カスタムブロック定義、または既存ブロック（例: `stonecutter`等）の仮割り当て
  - [ ] `minecraft:block.components.poi_type` の設定
  - [ ] `behavior_pack/data/poi/architect_workbench.json` の作成
- [ ] **棟梁職業データの作成 (`architect.json`)**
  - [ ] 村人（`villager_v2.json`）のイベント・コンポーネントグループの追加
  - [ ] POI ブロックの指定（`minecraft:point_of_interest_type`）
- [ ] **取引テーブル（`architect_trades.json`）の作成**
  - [ ] Lv.1 の取引アイテムに「仮の設計図アイテム」を登録
  - [ ] `loot_tables/villager_trades/architect_lv1.json` の定義

### 1-3. 建築コアスクリプトの実装 (`scripts/main.js`)
- [ ] **設計図データの定義（JSON 形式）**
  - [ ] `{ "blocks": [{x, y, z, id}, ...] }` の JSON 構造定義
  - [ ] 相対座標（起点からのオフセット）の計算ロジック
  - [ ] 3x3x3程度の超小型建築のテストデータ作成
- [ ] **設計図使用検知イベントの実装**
  - [ ] `world.beforeEvents.playerInteractWithBlock` によるアイテム使用検知
  - [ ] `event.cancel = true` で通常の設置をキャンセル
  - [ ] 設計図データの読み込みと建築リストの初期化
- [ ] **足場・囲い生成ロジック (`scaffolding_system.js`)**
  - [ ] 建築範囲の外周を計算し `minecraft:scaffolding` を配置する処理
  - [ ] `BlockPermutation.resolve("minecraft:scaffolding")` の利用
  - [ ] 囲いブロック（`minecraft:fence`）の追加設置
  - [ ] 松明・ランタンの自動設置（夜間作業用）
- [ ] **1 ブロックずつ積み上げるタイマー処理 (`architect_builder.js`)**
  - [ ] `system.runInterval` を利用した 1 秒ごとの非同期ブロック設置ループ
  - [ ] ✅ `block.setPermutation(BlockPermutation.resolve(...))` による安全な設置
  - [ ] ❌ `dimension.setBlock()` は使用不可（未定義 API）
  - [ ] 設置時の効果音（SE）およびパーティクル出力
- [ ] **完成時クリーンアップ処理 (`cleanup_system.js`)**
  - [ ] 配置した足場ブロックの一括空気化（`minecraft:air` 置換）
  - [ ] `BlockPermutation.resolve("minecraft:air")` の利用
  - [ ] 囲い・松明の撤去処理

### 🔧 1-4. 互換性確認ロジックの実装 ⭐ **重要**
- [ ] **起動時チェック機能の実装**
  - [ ] `world.beforeEvents` が使えるかログで確認（起動時チェック）
  - [ ] `system.runInterval` でタイマー処理を実装（`world.events.tick` の回避）
  - [ ] ✅ `block.setPermutation()` でブロック置換（`dimension.setBlock()` の回避）
- [ ] **互換性エラーのフォールバック処理**
  - [ ] API が未定義の場合の代替処理ロジック
  - [ ] ContentLog エラーの監視とログ出力

---

## 🎨 Phase 2: 演出・ランクシステムの拡充

### 2-1. 見た目・効果音（リソースパック拡張）
- [ ] **棟梁のテクスチャ・モデル作成**
  - [ ] はちまき・職人風エプロンのテクスチャ (`textures/villager/architect/entity.png`)
  - [ ] `villager_v2.json` のイベント・コンポーネントグループ設定
  - [ ] 建築中のアニメーション（腕を振る動作など）の定義
- [ ] **設計図アイテムのアイコン作成**
  - [ ] Lv.1〜Lv.5 ごとの設計図テクスチャ追加
  - [ ] アイテム用アトラス `textures/item_texture.json` の登録
- [ ] **大工・建築 SE の登録**
  - [ ] カンカン音、完成時のファンファーレなどの効果音定義
  - [ ] `sounds/architect_work/place_wood.ogg`, `place_stone.ogg` など

### 2-2. ランク別設計図データと取引の完成
- [ ] **Lv.1 〜 Lv.5 の建築データ準備**
  - [ ] Lv.1: 小型小物（街灯・井戸など）
  - [ ] Lv.2: 実用小建築（見張り台・釣り小屋など）
  - [ ] Lv.3: 生活拠点（和風民家・風車など）
  - [ ] Lv.4: 大型施設（豪華邸宅・城門など）
  - [ ] Lv.5: ランドマーク（五重の塔など）
- [ ] **レベルに応じた足場・工期・助手 NPC 召喚ロジックの実装**
  - [ ] Lv.1〜2: 短時間工事（数十秒〜1 分）
  - [ ] Lv.4〜5: 長時間工事（1〜2 日、夜は休憩演出）
  - [ ] 助手 NPC の召喚ロジック（Lv.4〜5 用）

### 2-3. ブロック定義・レシピの最適化 ⭐ **Minecraft_memo.md 準拠**
- [ ] **メニューカテゴリの設定**
  - [ ] `description.menu_category.category: "construction"` の追加
  - [ ] 建築タブへの表示確認
- [ ] **作業台レシピの作成**
  - [ ] 設計図アイテムのクラフトレシピ定義
  - [ ] 階層別グループカタログ登録（`item_catalog/crafting_item_catalog.json`）
- [ ] **採掘時間の最適化**
  - [ ] `seconds_to_destroy: 0.5` の設定（実験機能なしでの高速採掘）
  - [ ] ❌ `minecraft:tags` と `item_specific_speeds` は使用不可

---

## 🌐 Phase 3: データキャプチャ & Web ツール（道具箱）連携

### 3-1. マイクラ内スキャン（キャプチャ）機能
- [ ] **範囲選択ツールの作成**
  - [ ] 起点・終点を指定して建物の範囲（AABB）を決定する処理
  - [ ] 視覚的フィードバック（ワイヤーフレーム表示、半透明ブロックプレビュー）
- [ ] **範囲内ブロックデータ抽出スクリプト**
  - [ ] `getBlock` スキャンで相対座標・ブロック ID を取得
  - [ ] JSON テキストに変換して ContentLog やフォームに出力

### 3-2. 「TV のなっくすの道具箱」Web 連携
- [ ] **Web サイト側：設計図投稿・変換ツールの構築**
  - [ ] マイクラで出力した JSON の貼り付け・解析
  - [ ] プレビュー表示・他ユーザーへの共有機能
- [ ] **ゲーム内への設計図取り込み機能**
  - [ ] `ModalFormData` を使用した設計図コード貼り付け UI の作成
  - [ ] `.mcpack` 形式への自動変換パック出力機能の作成

### 3-3. データ共有システムの拡張 ⭐ **コミュニティ連携**
- [ ] **建築家のコメント・評価システム**
  - [ ] 設計図ページのレビュー機能
  - [ ] カテゴリ分け（小型・中型・大型、和風・洋風など）
- [ ] **ブロック ID マッピングテーブルの作成**
  - [ ] バニラ ↔ カスタム ブロック ID のマッピング
  - [ ] レシピ解放用のバニラ ID 設定

---

## 🔍 デバッグ・動作チェックリスト（常時確認）

### 📋 ContentLog の確認
- [ ] **`Scripting` エラーが出ていないか**
  - [ ] 未定義 API 呼び出し等の確認
  - [ ] `TypeError: cannot read property 'subscribe' of undefined` → script API の未対応・バージョン不一致
  - [ ] `TypeError: cannot read property 'tick' of undefined` → `world.events.tick` を使用している場合
- [ ] **`Blocks` 定義エラーが出ていないか**
  - [ ] JSON 仕様違反の確認（`child 'custom_components' not valid here` など）
  - [ ] レシピの `missing or invalid` エラー

### ⚠️ 非推奨・未定義 API の回避チェック
- [ ] **`world.events.tick` が使われていないか** → ✅ `system.runInterval` に変更
- [ ] **`dimension.setBlock()` が使われていないか** → ✅ `setBlockPermutation` または `block.setPermutation` に変更
- [ ] **`custom_components` は Bedrock 本体の API 仕様を確認してから使用するか**

### 🔄 マルチプレイ時の非同期同期処理の検証
- [ ] **足場・囲いの生成がマルチプレイで正しく動作するか**
- [ ] **建築リストの同期処理が正常に機能するか**
- [ ] **クリーンアップ処理がすべてのプレイヤーで実行されるか**

### 🧪 実機テストチェックリスト
- [ ] **クリエイティブモードでの動作確認**
  - [ ] 設計図使用から建築完了までの全フロー
  - [ ] 足場の自動設置・撤去
  - [ ] 効果音・パーティクルの再生
- [ ] **サバイバルモードでの動作確認**
  - [ ] シルクタッチ時のドロップ処理
  - [ ] アイテム消費ロジック（クリエイティブとの違い）
- [ ] **ランクシステムの実装確認**
  - [ ] Lv.1〜5 の取引アイテム解放
  - [ ] レベルごとの建築スケール変化

---

## 📊 進捗管理用ステータス

### ステータス定義
- [x] ✅ **完了**: 実装済み・動作確認済
- [ ] 🔄 **進行中**: 実装中・テスト中
- [ ] ⏳ **未着手**: 後回し・検討中
- [ ] ❌ **見送り**: 代替案あり・不要

### 優先度付け
- 🔴 **高優先度**: 最小プロトタイプ動作必須（Phase 1）
- 🟡 **中優先度**: 機能拡張・演出追加（Phase 2）
- 🟢 **低優先度**: 快適性向上・オプション機能（Phase 3）

---

## 📝 まとめ

このチェックリストは、以下の原則に基づいて作成されています：

✅ **Minecraft_memo.md の技術的制約を遵守**
   - `format_version: [1, 26, 0]` を最優先
   - 安定版 API (`@minecraft/server` 2.1.0) を使用
   - 未定義 API（`world.events.tick`, `dimension.setBlock()`）の回避

✅ **段階的な実装アプローチ**
   - Phase 1: ローカル動作確認 → Phase 2: 機能拡充 → Phase 3: コミュニティ連携

✅ **デバッグ・テスト重視**
   - ContentLog の常時監視
   - 実機テストの徹底（クリエイティブ・サバイバル両モード）

このチェックリストを基に、順次実装を進めていきましょう！🏗️
