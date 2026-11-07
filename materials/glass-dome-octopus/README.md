# Glass-Dome Octopus — 3D モデル（STEP 3 改善版）

参考画像 1 枚（`assets/reference.png`）から、**Three.js のコードだけ**で組み立てたロボットタコの 3D モデルです。
画像を 3D 空間に貼り付けたものではありません（画像は比較用 UI「参考構図」でのみ表示します）。

- 開く：`index.html`（GitHub Pages ではこのフォルダの URL）
- 参考技術：[Nyxera0x/cutaway](https://github.com/Nyxera0x/cutaway)（MIT）— ジオメトリ工房（`sweepX`・`gearGeo` など）、スタジオ照明、JOB_DESCRIPTION / CHECKLIST の方式を流用
- **STEP 3 の結果：重み付き品質スコア 70.0 → 79.0（目標 85 に未達）。** 詳細は [QUALITY_REPORT.md](QUALITY_REPORT.md)
  - このスコアは内部の品質管理指標で、客観的な画像類似度ではありません

> 分解アニメーション・動画・触手の動作制御は未実装です（指示書の禁止事項どおり）。人間の承認後に次の STEP へ進みます。

## 操作

| 操作 | PC | スマートフォン |
|---|---|---|
| 360° 回転 | ドラッグ | 1 本指ドラッグ |
| ズーム | ホイール | ピンチ |
| 視点リセット | ダブルクリック /「⟲ リセット」/ `R` | ダブルタップ |
| 自動回転 ON/OFF | 「⟳ 自動回転」/ `Space` | ボタン |
| 部品名 ON/OFF | 「🏷 部品名」/ `L` | ボタン |
| 正面・側面・背面・上・斜め | ボタン | ボタン |
| 参考画像と比較 | 「🖼 参考構図」（参考と同じ構図に移動し、参考画像を表示） | 同左 |

URL パラメーター：

| パラメーター | 内容 |
|---|---|
| `?q=low` / `?q=high` | 画質を固定 |
| `?auto=0` | 自動回転なし |
| `?labels=0` | 部品名なし |
| `?debug` | FPS を表示 |
| `?shot=hero\|front\|side\|rear\|oblique&ui=0` | 撮影用 |

## ファイル構成

```
glass-dome-octopus/
├── index.html             ページ（importmap で vendor/three を読む。ビルド不要）
├── src/
│   ├── main.js            レンダラー・画質ティア・ラベル・UI・描画ループ（必要時のみ）・適応画質・テスト用フック
│   ├── octopus.js         本体：ガラス（球の上 61%）・コア・ギア/ピストン/ホース・装甲・カメラ・ジェット
│   ├── tentacles.js       触手 8 本：関節の親子階層（Object3D）＋部品は InstancedMesh で共有
│   ├── materials.js       PBR マテリアル（クリアコート白・ダークチタン・ステンレス・真鍮・透過ガラス・発光緑）
│   ├── lighting.js        スタジオ：ソフトボックスの環境マップ・キー/リム/フィル・柔らかい床影
│   ├── controls.js        OrbitControls（タッチ対応）・ダブルクリックでリセット・視点トゥイーン
│   ├── measure.js         画面上の寸法計測（投影）とシルエット描画（STEP 3）
│   └── geometry.js        ジオメトリ工房（cutaway の parts.js から流用、MIT）
├── vendor/three/          three.js r186（MIT）
├── assets/reference.png   参考画像
├── tools/
│   ├── measure_render.mjs 参考構図の静止画・マスク・寸法を出力
│   ├── compare.py         参考との形状比率・色の比率を比較
│   ├── score.py           12 項目の重み付きスコア（計測部分と判定部分を分けて記録）
│   ├── turntable.mjs      360° チェック（8 方位）
│   ├── capture.mjs        各視点のスクリーンショット
│   ├── test.mjs           機能テスト（PC・スマホのエミュレーション）
│   └── measure.py         画像の色比率（STEP 2 の旧方式）
├── quality/               計測データ（before / round1 / round2 の JSON、score.json）
├── screenshots/
│   ├── reference-crop.png  before.png  round1.png  round2.png  comparison.png
│   ├── front.png  side.png  rear.png  oblique.png  turntable-360.png
│   ├── hero.png  hero-labels.png  mobile.png
│   └── rounds/            STEP 2 の各ラウンド
├── QUALITY_REPORT.md      STEP 3 の評価・実測値・改善前後・未解決の問題
├── CHECKLIST.md           参考画像の計測値とチェックリスト（STEP 3 の再計測を追記）
├── JOB_DESCRIPTION.md     共通ルール＋修正ログ（STEP 2・STEP 3）
└── glass-dome-octopus.zip 配布用（screenshots/rounds は除く）
```

ローカルで見る：`python3 -m http.server 8000` → `http://localhost:8000/`（ES Modules のため file:// では動きません）

計測と評価をやり直す（サーバーを起動した状態で、このフォルダで実行）：

```sh
node tools/measure_render.mjs /tmp/run && python3 tools/compare.py /tmp/run
node tools/test.mjs
python3 tools/score.py
```

## 構造（数値）

本体のガラス半径 0.965、床 y = 0、本体中心の高さ 1.45。

| 部品 | 内容 |
|---|---|
| ガラスドーム | 球の極角 0〜103°（高さの 61%）、MeshPhysicalMaterial（transmission）。スマホは半透明にフォールバック |
| コアリアクター | 発光球 r 0.19（×1.08）＋暗いリング 3＋ワイヤーケージ＋グロー。5 分割の暗いドラムの窓は参考構図の方向 |
| 内部機構 | ギア 30（うち真鍮 2）・ピストン 8・ホース 7・上部ユニット・サーボ 12・端子 40・デッキの緑の照り返し |
| 装甲 | カラーは赤道の 0.2 下。曲面パネル 3 段 19 枚（窓 7）、側面フレア 2（右に "VT-08"） |
| カメラ | 白い筒形ハウジング r 0.34（前へ突き出す）・ダークベゼル・緑リング・黒い光沢レンズ r 0.21（極角 106°）、副レンズ、背面ジェット |
| 触手 | 8 本 × 13〜15 節（計 111）。付け根の径 0.46、細り方 `TAPER(u)`。1 節あたり：重なる白い装甲 2・灰色の下板 2・継ぎ目・暗いコア・回転リング 2・緑ライン・軸ピン 2・吸着パッド 4・スロット 3・ボルト 4 |
| 配置 | 上に持ち上げ 2（T1・T2）・中段で横 2（T3・T7）・手前で床 4（T4・T8・T5・T6）（参考の配置） |

各触手は `T1-root → T1-joint0 → …` の親子階層です。関節を回すとその先が全部ついてきます。描画は部品の種類ごとに 1 つの InstancedMesh（8 本分）で、`tentacles.update()` が関節のワールド行列をインスタンスに写します。

## テスト・パフォーマンス

- `node tools/test.mjs`：**24 / 24 合格**
  - PC：マウス・ホイール・リセット・ボタン・リサイズ・エラーなし
  - スマホ（iPhone 13 エミュレーション）：タッチ回転・ピンチ・ダブルタップ・横向きへの回転・エラーなし
  - **実機では確認していません。**
- **FPS の目標（PC 60 / スマホ 30）は未検証です。** この環境には GPU がなく、ソフトウェア描画では 0.4〜6.8 fps（実機性能ではない）。実機で `?debug` を付けると FPS が表示されます。
- 描画量：1 パス約 60 万三角形（触手 73%）。高画質は影と透過のパスを含めて約 178 万・476 ドローコール／フレーム。
- JS ヒープ 19.6 MB、ジオメトリ 170、テクスチャ 9。
- 対策：InstancedMesh とジオメトリの共有、操作がないときは描画しない、スマホは透過なし・影 1024・画素比 ≤ 1.5、適応画質（40fps 未満で画素比を下げ、28fps 未満で透過を切る）、ResizeObserver、コンテキスト喪失の表示、離脱時の破棄。

## クレジット

- three.js r186 — MIT（`vendor/three/LICENSE`）
- Nyxera0x/cutaway — MIT（`src/geometry.js` のジオメトリ関数、スタジオ照明の構成、JOB_DESCRIPTION / CHECKLIST の方式）
