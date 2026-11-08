# Knowledge Site

勉強会資料をまとめた統合サイトです。`index.html` を開くと資料一覧が表示され、好きな資料を選んでその場で読めます。
（構成・仕組みは [Mini Game Arcade](https://cuichunxue.github.io/Mini_game/) と同じです）

## 構成

```
index.html                  統合サイト（資料一覧・閲覧画面・管理画面）
materials.js                組み込み資料の一覧（ここに登録した資料がサイトに並ぶ）
materials/<id>/index.html   各資料本体
```

## 収録資料

| # | 資料 | カテゴリ | レベル |
|---|------|----------|--------|
| 1 | [AIで「分解できる3D機械生物」を作る](materials/cutaway-3d/index.html) | AI活用 | 初級 |
| 2 | [Glass-Dome Octopus — 参考画像1枚から作る3Dロボットタコ](materials/glass-dome-octopus/index.html)（STEP 4：分解・再組み立てできる版） | AI活用 | 初級 |

## 使い方

- カテゴリのボタン、レベル、キーワード検索で絞り込めます。並び順は「新着順 / 人気順 / タイトル順」。
- 「📖 開く」でサイト内に表示、「← 一覧」で戻ります（Esc キーでも戻れます）。
- 🔗 で資料のURLをコピー、↗ で別タブ、⛶ で全画面表示。
- 資料ごとの URL（例：`index.html#/view/cutaway-3d`）を直接開くこともできます。勉強会の参加者にはこのURLを送ると便利です。

## 閲覧数とランキング

- 資料を開くたびに閲覧数が 1 増えます（全員分の合計）。資料が 2 件以上になると「🏆 よく読まれている資料」が表示されます。
- 回数は無料のカウンターサービス [Abacus](https://abacus.jasoncameron.dev) に保存しています（登録不要）。
  - 保存先の名前は `index.html` の `COUNTER_NS`（`cuichunxue-knowledge-site`）です。
  - 誰でも回数を増やせる簡易的な仕組みです。厳密な集計には向きません。

## 資料の追加・削除

### サイト上で行う（このブラウザだけに反映）

「⚙ 管理」を押すと管理者パスワードを聞かれます。**Mini Game Arcade と同じパスワード**です。
パスワードは `materials.js` の `ADMIN_PASSWORD_HASH` に、`"mini-game-arcade:" + パスワード` の SHA-256 ハッシュとして保存しています。
※ 公開サイトなので簡易ロックです。

- **追加**：「＋ 資料を追加」から HTML ファイルをアップロードするか、URL / パスを指定します。
- **削除**：カード右上の ✕ を押します。「削除した資料を元に戻す」で戻せます。

### サイト全体に反映する（全員に反映）

1. `materials/<id>/index.html` に資料を置く
2. `materials.js` の配列に 1 件追加する

```js
{
  id: "git-basics",
  title: "はじめてのGit入門",
  description: "資料の説明",
  path: "materials/git-basics/index.html",
  emoji: "🌱",
  color: "#14744a",
  accent: "#7cf0b6",          // 省略可
  category: "開発ツール",
  level: "初級",               // 初級 / 中級 / 上級
  duration: "45分",
  tags: ["Git", "GitHub"],
  date: "2026-12-01"           // 30日以内は NEW 表示
}
```

資料の中身を更新したら `materials.js` の `MATERIALS_VERSION` を上げてください。

## ローカルで動かす

```sh
python3 -m http.server 8000
# http://localhost:8000/ を開く
```

## GitHub Pages で公開する

リポジトリの Settings → Pages で、公開したいブランチのルート（`/`）を選ぶと公開されます。
