# Nonax Architect Pack 仕様書

> **重要（新規作成方針）**: 現在 `Nonax_Architect_Pack/behavior_pack/Nonax_Architect_Pack` および `Nonax_Architect_Pack/resource_pack/Nonax_Architect_Pack` にある既存ファイルは LLM 生成の動作しないもので、Minecraft に適用するとクラッシュする。**これらは破棄対象であり、内容・UUID・識別子・テクスチャ・モデルを含め一切流用せず、バニラサンプルを基準にゼロから作成する。** 既存ファイルの削除・置換は、作成フェーズの開始指示を受けてから行う。

> **最重要制約（必須）: 実験機能（Experiments / ベータ API）を有効にしない。** すべての機能は、実験トグルなしの安定版機能のみで成立させること。実験機能を要求する機能（カスタム村人職業・カスタム POI ブロック、ベータ版 Script API など）は採用しない。ワールド作成時に実験トグルが OFF の状態で起動・動作することを、各フェーズの合格条件とする。
>
> この制約により、**「棟梁」はバニラ村人の新職業ではなく、カスタムエンティティ（NPC）として実装する。** 村人の職業 / POI の仕組みには依存しない。

## 1. 概要と機能要件

### 概要
カスタムエンティティ NPC「棟梁」を追加し、設計図を使って小規模な建築を段階的に行えるようにする。棟梁はカスタムエンティティの取引機能で設計図や建材を取引し、ランクに応じた取引内容を提供する。初期リリースでは、棟梁 NPC の入手手段・Lv.1 設計図・安全なブロック配置を含む最小プロトタイプを完成させる。上位ランク、建築演出、設計図共有は段階を分けて追加する。

### 機能要件
- 棟梁 NPC（`nonax:architect`）を、スポーンエッグまたはクラフト可能な召喚アイテム・自然スポーンのいずれかで入手・出現できるようにする。入手方法は初期版で 1 種に絞る（スポーンエッグ優先）。
- 棟梁 NPC との取引は、エンティティの取引コンポーネントと取引テーブルで実装する。村人の職業・POI・村人の自動転職には依存しない。
- 「棟梁の作業台」ブロックは、必要であれば通常のカスタムブロック（装飾・召喚用）として扱う。POI としての機能は持たせない。
- Lv.1 設計図を使用すると、使用位置を基準に登録済みの小型建築をブロック単位で設置する。
- 建築開始前に設置範囲、対象ブロック、置換可否を検査する。範囲外、未対応ブロック、既存ブロックとの競合がある場合は開始せず、プレイヤーに理由を通知する。
- 設置処理は `system.runInterval` で分割し、1 回の処理量を制限する。プレイヤーによる重複開始、ワールド終了、途中エラーに備え、建築ジョブを追跡して安全に停止・後始末する。
- 足場などの仮設物を使う場合は、生成した座標とブロックを記録し、完了・中断時にその仮設物だけを撤去する。既存ブロックを上書きしない。
- 設置失敗や Script API の例外は `try-catch` で捕捉し、原因を Content Log に記録する。成功扱いで処理を継続しない。
- 初期プロトタイプの設計図と建築データはアドオン内に同梱する。資材消費、助手 NPC、長期工事、建築データの書き出し・Web 共有は後続フェーズとする。
- Lv.1〜Lv.5 の設計図テーマと取引内容は段階的に拡張する。最初の動作確認では 3x3x3 程度の小型建築 1 種を対象とする。
- 実験機能を有効化せずに動作すること（必須）。カスタム NPC は独自のモデル・テクスチャを持てるため、はちまき・エプロンなどの外見は棟梁エンティティ自体のリソースで表現する。

### 初期設計図データ
設計図はアドオン内の JavaScript データとして保持し、原点からの相対座標で定義する。

```js
{
  id: "nonax:blueprint_lv1_test",
  size: { x: 3, y: 3, z: 3 },
  blocks: [
    { x: 0, y: 0, z: 0, id: "minecraft:oak_planks" }
  ]
}
```

設計図データは次の条件を満たすこと。
- すべての座標が宣言したサイズ内にある。
- 配置数、各座標、ブロック ID を建築開始前に検証する。
- 初期版では回転や反転、カスタムブロック、外部入力データを扱わない。

## 2. 必要なファイル構成（BP / RP）

実際のパックルートは `Nonax_Architect_Pack/behavior_pack/Nonax_Architect_Pack/` と `Nonax_Architect_Pack/resource_pack/Nonax_Architect_Pack/`。下記は新規作成するファイルを示す。既存ファイルは再利用せず、旧パックを破棄した上で新しい UUID と構成で作り直す。

### Behavior Pack（BP）

```text
behavior_pack/Nonax_Architect_Pack/
├── manifest.json
├── entities/
│   └── nonax_architect.json
├── trading/
│   ├── nonax_architect_lv1.json
│   ├── nonax_architect_lv2.json
│   ├── nonax_architect_lv3.json
│   ├── nonax_architect_lv4.json
│   └── nonax_architect_lv5.json
├── items/
│   ├── nonax_blueprint_lv1.json
│   ├── nonax_blueprint_lv2.json
│   ├── nonax_blueprint_lv3.json
│   ├── nonax_blueprint_lv4.json
│   └── nonax_blueprint_lv5.json
├── blocks/
│   └── nonax_architect_workbench.json
├── recipes/
│   └── nonax_blueprint_*.json
└── scripts/
    └── main.js
```

- `blocks/`（作業台）、`recipes/`、Lv.2〜Lv.5 の取引・アイテムは後続フェーズで追加する。作業台は POI ではなく通常のカスタムブロックとし、初期版では作らなくてよい。
- 棟梁は `entities/` のカスタムエンティティ（取引コンポーネント付き）として定義する。村人職業・POI・`villager_professions/`・`poi/` は使わない。
- スクリプトを使う BP マニフェストには `script` モジュール、エントリポイント、`@minecraft/server` 依存を定義する。スクリプトの依存は安定版 `2.11.0`（v26.62 で動作確認した版）とし、`-beta` 付きのバージョンは使わない。古い Minecraft への互換は考慮しない（主な利用環境は自動更新されるコンシューマ機）。長期運用のため、更新後は Content Log の `promoted` 行と Scripting エラーを確認し、API の廃止・変更があれば依存版を上げて修正する。実際のゲームログでロード結果を確認する。
- `@minecraft/server-net` は初期版では依存に含めない。外部連携を実装する段階で必要性と利用条件を確認する。

### Resource Pack（RP）

```text
resource_pack/Nonax_Architect_Pack/
├── manifest.json
├── entity/
│   └── nonax_architect.entity.json
├── render_controllers/
│   └── nonax_architect.render_controllers.json
├── models/
│   ├── entity/
│   │   └── nonax_architect.geo.json
│   └── blocks/
│       └── nonax_architect_workbench.geo.json
├── textures/
│   ├── terrain_texture.json
│   ├── item_texture.json
│   ├── entity/
│   │   └── nonax_architect.png
│   ├── blocks/
│   │   ├── nonax_architect_workbench_front.png
│   │   ├── nonax_architect_workbench_side.png
│   │   └── nonax_architect_workbench_top.png
│   └── items/
│       └── nonax_blueprint_lv1.png
├── texts/
│   ├── ja_JP.lang
│   └── en_US.lang
└── sounds/
    └── sound_definitions.json
```

- Lv.2 以降の設計図アイコン、独自効果音は必要性と対応方法を確認してから追加する。棟梁の外見は `entity/`・`render_controllers/`・`models/entity/`・`textures/entity/` で新規定義する（最初はバニラ村人相当の仮モデルで可）。
- 既存の作業台テクスチャ・モデルは流用せず、新規に作成する（最初はバニラ形状・仮テクスチャで可）。

## 3. コンポーネントおよび JSON 設定方針

- 対象環境は Minecraft Bedrock Edition v26.62、`min_engine_version` は `[1, 26, 0]` とする。
- JSON の `format_version` はファイル種別ごとのスキーマに従い、対象環境で受理される安定版を使う。全 JSON に同じ値を機械的に設定しない。`format_version` と `min_engine_version` は別の設定である。
- Behavior Pack / Resource Pack のマニフェストは `format_version: 2` とし、モジュール UUID は一意にする。BP と RP の相互依存 UUID・バージョンを一致させる。
- 実験機能（Experiments）・ベータ API を一切要求しないこと。ワールドの実験トグルを OFF にして適用し、起動確認する。`-beta` 付きの Script API バージョン、プレビュー専用の `format_version`・コンポーネントは使わない。
- アドオン独自のブロック、アイテム、エンティティ、設計図などの識別子は `nonax:` 名前空間に統一する（例: `nonax:architect`, `nonax:architect_workbench`, `nonax:blueprint_lv1`）。バニラ参照のみ `minecraft:` を使う。
- JSON はコメントなしの厳密な JSON とする。`custom_components` など、採用するゲームバージョンで検証されていない機能や実験機能を前提にしない。
- 各 JSON の `format_version` と使用コンポーネントは、バニラサンプル（`bedrock-samples-v1.26.60.5-full`）の同種ファイルに合わせ、実験トグルなしで読み込めることを確認してから採用する。
- 棟梁エンティティは、取引コンポーネント（`minecraft:economy_trade_table` / `minecraft:trade_table` 等）と取引テーブルを、バニラサンプルの定義を基準にして構成する。ランク（Lv.1〜Lv.5）の表現は、取引テーブルの階層・条件で実現可能かを検証し、不可能な場合は Script API でのランク管理（ダイナミックプロパティ等）や、ランク別エンティティ・取引の切り替えで代替する。
- 棟梁の外見・アニメーションは、エンティティのクライアント定義（RP）で行う。
- 作業台を設ける場合は、通常のカスタムブロック（POI 機能なし）として定義する。必要な表示名・カテゴリ・ジオメトリ・テクスチャを設定し、サンプルと Content Log でスキーマを確認する。
- 旧パックの JSON は誤りを含むため参照しない。ブロック単体 → 設計図アイテム → スクリプト建築 → 棟梁エンティティ・取引の順に、1 要素ごとに起動確認しながら進める。
- アイテムは設計図ごとに一意の `nonax:` ID とローカライズキーを持たせる。設計図の利用操作・消費条件は、スクリプトのイベント仕様を確認した上で実装する。

## 4. Script API 処理フロー

`@minecraft/server` 2.11.0 の ES Modules を使用し、利用 API の有無とイベント仕様を実装時に v26.62 のサンプル・ログで確認する。未定義の `world.events.tick` や `dimension.setBlock()` は使用しない。

1. **初期化**
   - `scripts/main.js` から `world`, `system`, `BlockPermutation` など必要な API を import する。
   - イベント購読とタイマー起動を設定する。初期化に失敗した場合はエラーを Content Log に出し、無効な状態で建築を開始しない。
2. **設計図使用の検知**
   - ブロックに対する操作を入口とする場合は `world.beforeEvents.playerInteractWithBlock` を候補とし、設計図アイテムを所持・使用した操作のみを識別する。
   - イベント引数・キャンセル可否・アイテム識別方法を API 2.11.0 で確認する。要件を満たさない場合は、同バージョンでサポートされるアイテム使用イベントに切り替える。
   - 操作位置から建築原点を決定し、必要なら配置方向を正規化する。
3. **事前検証**
   - 同一プレイヤーまたは同一領域に進行中ジョブがないことを確認する。
   - 設計図データ、建築範囲、ワールド境界、読み込み済み領域、対象ブロック ID を検証する。
   - 既存ブロックを上書きしないことを確認する。検証失敗時はジョブを登録せず、プレイヤーへ理由を通知する。
4. **現場準備（必要な場合のみ）**
   - 建築データから仮設足場・囲いの候補座標を計算し、配置可能性を確認する。
   - 仮設物を設置した座標と種類をジョブに保存する。初期版では足場なしの単純な建築を優先する。
5. **ブロック配置**
   - 建築ジョブのキューを `system.runInterval` で処理し、1 回の実行で少数のブロックだけを置く。
   - 対象座標の `Block` を取得し、`BlockPermutation.resolve(blockId)` と `block.setPermutation(...)` を用いる。取得失敗・例外は記録し、当該ジョブを明示的に停止または失敗扱いにする。
   - 配置間隔を設け、処理負荷・マルチプレイ同期・プレイヤー離脱時の挙動をテストする。
6. **完了・中断・後始末**
   - 全ブロック配置後にジョブを終了し、記録した仮設物のみを確認の上撤去する。
   - 失敗・中断時も同じ後始末経路を使う。仮設物の座標に別のブロックが置かれていた場合は削除しない。
   - 完了・失敗をプレイヤーに通知し、Content Log にジョブ ID とエラー原因を記録する。
7. **演出（後続フェーズ）**
   - 効果音・パーティクルは配置成功後に実行する。アニメーションや棟梁の移動制御は、エンティティ定義と API 2.11.0 の安定機能で実現可能な方法を確認してから追加する。

## 5. 開発手順タスクリスト

> 凡例: `[x]` 完了（実機確認済み）、`[~]` 実装済み・実機未確認、`[ ]` 未着手

### Phase 1 — 最小プロトタイプ
- [x] 旧 BP / RP を破棄（退避）し、新しい UUID でマニフェストを作成する。（旧パックは `_old_discarded/` に退避。`@minecraft/server` は 2.11.0 を指定）
- [x] 最小構成（マニフェストのみ）を、**実験トグル OFF のワールド**に適用し、クラッシュ・Content Log エラーがないことを確認する。以降は 1 要素追加するごとに、実験トグル OFF のまま同様に起動確認する。
- [x] Lv.1 設計図アイテムを `nonax:` 識別子で新規作成し、起動を確認する。（クリエイティブで取得できることを確認済み）
- [x] Lv.1 設計図アイテムと小型テスト建築データを定義する。（`scripts/blueprints.js` に 3x3x3 の小屋を定義）
- [x] `main.js` に設計図操作検知、建築前検証、重複ジョブ防止、通知を実装する。
- [x] `system.runInterval` と `Block.setPermutation` を用いた少量・逐次配置を実装する。（5 tick ごとに 1 ブロック）
- [x] 失敗時の停止・ログ出力を実装する。（仮設物の後始末は足場の実装時に対応。設置先が埋まった場合・プレイヤー退出時の中断は未検証）
- [x] Content Log で JSON / Script API エラーがないことを確認する。（2026-11-06 のログで確認。建築 2 回とも 25/25 で完了）
- [ ] クリエイティブ・サバイバルの単独プレイおよびマルチプレイで、設置・競合・中断・再実行をテストする。（クリエイティブ単独で、建築・重複使用の拒否・既存ブロックとの競合の拒否は確認済み。サバイバル・マルチ・中断系は未確認）

### Phase 2 — 棟梁 NPC・取引・演出の拡充
- [~] 棟梁カスタムエンティティ（NPC）を新規作成し、スポーンエッグでの出現と取引画面の表示を、実験トグル OFF で確認する。（`nonax:architect` を作成。外見はバニラ村人のモデル・商人のテクスチャを参照する仮実装。実機未確認）
- [~] Lv.1 取引テーブルを実装し、Lv.2〜Lv.5 のランク表現方式（取引階層 / Script API でのランク管理 / ランク別エンティティ）を検証して決定する。（Lv.1 の取引 4 種を実装済み・実機未確認。ランク方式は未検証）
- [ ] Lv.2〜Lv.5 の取引・設計図・建物を段階的に追加する。
- [ ] 足場・囲い・夜間照明の生成と撤去を、既存ブロックを保護する形で追加する。
- [ ] 建築音・パーティクルを追加し、リソース登録と実機再生を確認する。
- [ ] 作業台・設計図の表示名、アイコン、カタログ、レシピを整備する。
- [ ] 棟梁の外見（モデル・テクスチャ・アニメーション）と移動演出を、安定仕様の範囲で実装する。

### Phase 3 — 設計図共有（将来検討）
- [ ] 範囲選択と建物データの安全な抽出仕様を定義する。
- [ ] JSON データのサイズ・座標・ブロック ID を検証する形式を定義する。
- [ ] Web サイトでの共有・プレビュー方法を別途設計する。
- [ ] ゲーム内取り込みは利用可能な API と安全性を検証し、外部通信・貼り付け機能を採用するか判断する。

参考: [アイデアまとめ](../../Nonax_Architect_Pack/documents/idea_sum.md)、[開発チェックリスト](../../Nonax_Architect_Pack/documents/Development_Checklist.md)
