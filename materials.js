/*
 * 勉強会資料の一覧（サイトに常に表示される「組み込み資料」）
 *
 * ■ 資料を追加する
 *   1. materials/<id>/index.html に資料（HTML）を置く
 *   2. 下の配列に 1 件追加する（新しいものを上に）
 *
 * ■ 資料を削除する
 *   1. 下の配列から該当行を消す
 *   2. materials/<id>/ フォルダを消す
 *
 * 資料の中身を更新したら MATERIALS_VERSION の数字を上げてください（スマホの古いキャッシュを使わせないため）。
 *
 * サイト上の「管理」画面からも追加・削除できます（その場合はこのブラウザだけに保存されます）。
 *
 * 項目:
 *   id          英数字とハイフン。URL（#/view/<id>）とクリック数の集計に使う。後から変えない。
 *   title       タイトル
 *   description 一覧に出る説明（1〜2文）
 *   path        資料の場所
 *   emoji       カードのアイコン
 *   color       カード背景色 / accent アクセント色（省略可）
 *   category    分類（絞り込みボタンになる）
 *   level       初級 / 中級 / 上級
 *   duration    目安の所要時間
 *   tags        キーワード（検索対象）
 *   date        公開日 YYYY-MM-DD（30日以内は NEW 表示）
 */
window.MATERIALS_VERSION = "4";

/* 管理画面のパスワード（SHA-256 ハッシュ。パスワードそのものは書かない）
 * Mini Game Arcade と同じパスワードで入れます。
 * 変更するには: "mini-game-arcade:" + 新しいパスワード を SHA-256 にかけた値に置き換える */
window.ADMIN_PASSWORD_HASH = "c7793f384cf22b066d54f9b21c81c3cb8ef8c240488cfd3654c551c5dc2c0534";

window.MATERIALS = [
  {
    id: "glass-dome-octopus",
    title: "Glass-Dome Octopus — 分解できる3Dロボットタコ",
    description: "参考画像1枚から Three.js のコードだけで組み立てたロボットタコ。部品をタップして分解、全体分解・再組み立て・スライダーで内部を観察できます（STEP 2〜4 の実践例）。",
    path: "materials/glass-dome-octopus/index.html",
    emoji: "🐙",
    color: "#0f5c3c",
    accent: "#2bff9c",
    category: "AI活用",
    level: "初級",
    duration: "15分",
    tags: ["Three.js", "WebGL", "3D", "Claude Code", "cutaway", "実践例", "品質評価", "分解アニメーション"],
    date: "2026-11-07"
  },
  {
    id: "cutaway-3d",
    title: "AIで「分解できる3D機械生物」を作る",
    description: "ChatGPTの参考画像1枚から、Claude Code と Three.js で部品ごとに分解できる3Dモデルと動画を作る。ジョブディスクリプション方式の全手順。",
    path: "materials/cutaway-3d/index.html",
    emoji: "🦈",
    color: "#14744a",
    accent: "#7cf0b6",
    category: "AI活用",
    level: "初級",
    duration: "60分",
    tags: ["Claude Code", "ChatGPT", "Three.js", "3D", "プロンプト設計"],
    date: "2026-11-07"
  }
];
