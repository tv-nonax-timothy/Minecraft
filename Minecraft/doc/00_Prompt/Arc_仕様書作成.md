これから新しいアドオンを作成します。コードを書く前に、まずは設計・仕様を整理して `doc\01_Want_to_do\Nonax_Architect_Pack_Specification.md` に保存できる形式で出力してください。

【やりたいことの概要】
- `Nonax_Architect_Pack\documents\idea_sum.md` ここにやりたいことのアイデアをまとめてあります。

【出力フォーマット】
以下の構成で Markdown 形式でまとめてください：
1. 概要と機能要件
2. 必要なファイル構成（BP / RP のパス一覧）
3. コンポーネントおよび JSON 設定方針（format_version: 1.21.0 / nonax ネームスペース）
4. Script API 処理フロー（@minecraft/server 2.1.0 前提のイベント・ロジック）
5. 開発手順タスクリスト（チェックボックス形式）