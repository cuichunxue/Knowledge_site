# Glass-Dome Octopus — 分解・再組み立てできる 3D ロボット（STEP 4）

参考画像 1 枚（`assets/reference.png`）から **Three.js のコードだけ**で組み立てたロボットタコです。
STEP 4 で、15 の部品グループを **タップで分解・再組み立て**できるようにしました。画像や動画を貼ったものではありません。

- 開く：`index.html`（GitHub Pages ではこのフォルダの URL。ビルド不要）
- 参考技術：[Nyxera0x/cutaway](https://github.com/Nyxera0x/cutaway)（MIT）
- テスト結果：[STEP4_TEST_REPORT.md](STEP4_TEST_REPORT.md)
- 外観評価：[QUALITY_REPORT.md](QUALITY_REPORT.md)（STEP 3 の重み付き 79.0 点で、目標 85 には未達。STEP 4 では外観を変えていません）

> STEP 5（動画）は未着手です。人間の承認を待っています。

## 展示動画（15 秒）

[`video/glass-dome-octopus-15s.mp4`](video/glass-dome-octopus-15s.mp4)（1920×1080・30fps・H.264＋AAC・18.6 MB、ポスター画像 `video/poster.jpg`）

| 時間 | 内容 |
|---|---|
| 0〜2 秒 | タイトル、組み立て状態をゆっくり回り込む |
| 2〜3.6 秒 | P01 ガラスドームが浮く |
| 3.6〜5.5 秒 | P02 AI コアが浮上し、リングが開く（正面近接） |
| 5.8〜7.7 秒 | 触手 3 が外れ、関節が順に開く |
| 8〜11.6 秒 | 全体分解（15 部品） |
| 12〜13.4 秒 | 分解状態のまま回り込む |
| 13.4〜15 秒 | 1 秒で再組み立て → エンドカード |

作り方（画面録画ではなく 1 フレームずつ正確に書き出す）：

- `src/film.js`：時刻 t から分解状態・カメラ・字幕を決める純関数のタイムライン（`?film` で開くと `window.__octo.film.frame(t)` が使える）
- `tools/film.mjs`：450 フレームを PNG に書き出す（ソフトウェア描画で 1 フレーム約 5 秒、全体で約 36 分）
- `tools/film_audio.py`：同じタイムラインの拍（ロック解除のクリック、サーボ音、全体分解での部品ごとのクリック、再組み立ての音）から音を合成
- `tools/film_encode.sh`：ラウドネスを -14 LUFS に合わせ（2 パス）、H.264 / AAC にまとめる

完成ファイルの実測ラウドネスは -13.4 LUFS、トゥルーピーク -1.1 dBTP です。AAC にしたときに、目標から 0.6 LU ずれました。

```sh
node tools/film.mjs /tmp/frames 1920 1080 30 2      # フレーム（再開可能）
tools/film_encode.sh /tmp/frames video/glass-dome-octopus-15s.mp4 30
```

## あそびかた

| やりたいこと | 操作 |
|---|---|
| 部品を分解する | 部品をタップ／クリック、または左の「部品をえらぶ」（スマホは「🧩 部品」）。緑の輪郭が光り、カメラが寄り、ロックが外れて開く |
| 閉じる | 同じ部品をもう一度タップ、カードの ✕、何もない所をタップ、`Esc` |
| 全部ばらす | 「💥 全体分解」（`E`）：ドーム → パネル → カメラ → ギア → コア → 触手 8 本 → 推進ユニット → パッド |
| 元に戻す | 「🔧 再組み立て」（`A`）：1.6 秒で逆順に戻る |
| 途中を見る | 下のスライダー（0〜100%）。同じ位置なら必ず同じ配置 |
| 一時停止 | ⏸ / ▶（`Space`） |
| 回転・ズーム | ドラッグ・ピンチ／ホイール。ドラッグすると自動カメラはすぐ止まる |
| 視点を戻す | ダブルタップ／ダブルクリック、⟲（`R`：全部組み立てて視点も戻す） |
| その他 | ⋯ メニュー：正面・側面・背面・上・斜め・参考構図、「選択部品以外を半透明にする」、参考画像、説明 |

最初の数秒は、タップできる部品に緑の点（ホットスポット）が出ます。最初の操作をするか、15 秒たつと消えます。

## 部品（15 グループ）と動き

| ID | 部品 | 分解の動き | カメラ |
|---|---|---|---|
| P01 | ガラスドーム | ボルトが浮き、真上へ持ち上がる | 斜め上方 |
| P02 | AI コア | 上部ユニットが回って外れ、リアクターが浮上してリングが開く | 正面近接 |
| P03 | 前方カメラ | レンズが 1/4 回転し、光軸に沿って外へ、そして上へ | 正面マクロ |
| P04 | 外装パネル | ボルトが外れ、放射状に開く（触手の横の板は触手が外れてから） | 側面 |
| P05 | 内部ギア | 回転しながら軸に沿って抜ける（縦ギアは上へ） | 斜め上方から内部 |
| P06 | 推進ユニット | ひねって外れ、後方へ | 後方 |
| P07–P14 | 触手 1〜8 | ロックリングが回り、アームが外れ、関節が根元から順に開く（軸とピストンが見える） | 関節が見える斜め側面 |
| P15 | 吸着パッド（触手 5） | カップ・発光リム・吸引口の 3 層に浮く | 近接 |

接続関係と数値は [CHECKLIST.md](CHECKLIST.md) の「STEP 4」の表を見てください。

## しくみ（設計）

- **決定論的な描画**：`explosion.render(state)` は、保存した初期 Transform から毎回絶対配置を計算します（加算しない）。
  - `state = {p, ind}`：p は全体の分解率、`ind[id]` は部品ごとの分解率です。
  - 部品の進捗は「p の担当区間」と「個別の値」の大きい方で、依存関係も加えます（例：コアの前にドーム）。
  - 同じ state なら必ず同じ配置になり、0 に戻せば STEP 3 の形に誤差 0 で戻ります（テストで確認）。
- **アニメーション**：`animation.js` のトゥイーンは常に現在値から始まります。そのため、途中で逆再生・部品の変更・一時停止をしても跳びません。回転は Quaternion で、各部品のイージングは `explosion.js` にあります。
- **触手**：触手ごとに Object3D の関節階層を持ちます。分解では次の順に動きます。
  1. 根元のロックリングが回る
  2. 根元がスライドして外れる
  3. 各関節が親セグメントの軸に沿って開く
  4. 開いた隙間に軸とピストンが伸び、パッドが層に分かれる

  描画は部品の種類ごとに 1 つの InstancedMesh（8 本分）です。
- **カメラ**：`cameraDirector.js` が、部品を開いた状態をいったん仮に描いて注視点を求め、位置と注視点の両方を補間します。ユーザーがドラッグするとすぐに止まります。
- **選択**：`interaction.js` がレイキャストで部品を拾います。触手はインスタンス番号から関節と触手を割り出します。
  - 強調：法線方向に押し出した緑の輪郭が 0.2 秒光ります。
  - フォーカス：触手以外を選んだときは周りを半透明に、触手を選んだときは他の触手を暗くします。
  - ダブルタップ：シングルタップの選択と同じ場所で判定します。
- **TRIZ**
  - 矛盾 A（部品が多い ↔ 扱いやすさ）：3 階層のメニュー、半透明化、自動カメラ
  - 矛盾 B（派手さ ↔ 機械らしさ）：接続軸に沿った移動、ロック解除の段階、機構として自然な回転・スライド
  - 矛盾 C（精細 ↔ スマホ）：InstancedMesh、距離による細部の省略（LOD）、端末に応じた画質ティア、操作がないときは描画しない

## ファイル構成

```
glass-dome-octopus/
├── index.html              ページと UI（importmap で vendor/three を読む）
├── src/
│   ├── main.js             全体の結線：レンダラー・画質・ラベル・ホットスポット・描画ループ・テスト用フック
│   ├── octopus.js          本体（STEP 3 の形そのまま。部品のタグと分解用のグループ分けを追加）
│   ├── tentacles.js        触手 8 本：関節階層・InstancedMesh・分解ポーズ（スライド・関節の開き・軸・パッド）
│   ├── materials.js        PBR マテリアル
│   ├── lighting.js         スタジオ照明・床の影
│   ├── controls.js         OrbitControls・視点トゥイーン
│   ├── explosion.js        部品の定義 P01〜P15・依存関係・render(state)・初期状態との誤差チェック
│   ├── animation.js        状態 {p, ind} のトゥイーン（逆再生・一時停止・速度）
│   ├── cameraDirector.js   部品ごとの観察カメラ
│   ├── interaction.js      選択（レイキャスト）・緑の輪郭・半透明化・タップとダブルタップ
│   ├── ui.js               部品メニュー・情報カード・スライダー・ボタン・ホットスポット
│   ├── measure.js          画面上の寸法計測（STEP 3）
│   └── geometry.js         ジオメトリ工房（cutaway 由来、MIT）
├── vendor/three/           three.js r186（MIT）
├── tools/
│   ├── test_step4.mjs      STEP 4 のテスト（機能・安定性・スマホ）
│   ├── test.mjs            STEP 2/3 の回帰テスト
│   ├── collide.mjs         分解中の貫通チェック（近似）
│   ├── capture_step4.mjs   STEP 4 のスクリーンショット
│   └── measure_render.mjs  compare.py  score.py  turntable.mjs  capture.mjs  measure.py（STEP 2/3）
├── quality/                計測・テストの生データ（JSON）
├── screenshots/            STEP 4：assembled / dome-open / core-exposed / camera-macro / gears-out /
│                           tentacle-exploded / pads-open / full-explosion / step4-mobile / step4-vs-step3
│                           STEP 3：reference-crop / before / round1 / round2 / comparison / front / side / rear / oblique / turntable-360
├── STEP4_TEST_REPORT.md    STEP 4 のテスト結果と未解決の課題
├── QUALITY_REPORT.md       STEP 3 の外観評価（＋ STEP 4 での外観維持の確認）
├── CHECKLIST.md            計測値・チェックリスト・STEP 4 の部品設計表
├── JOB_DESCRIPTION.md      共通ルールと修正ログ（STEP 2〜4）
└── glass-dome-octopus.zip  配布用
```

ローカルで見る：`python3 -m http.server 8000` → `http://localhost:8000/`（ES Modules のため file:// では動きません）

テストを動かす（サーバー起動後、このフォルダで実行）：

```sh
node tools/test_step4.mjs   # STEP 4
node tools/test.mjs         # STEP 2/3 の回帰
node tools/collide.mjs      # 貫通チェック
```

## クレジット

- three.js r186 — MIT（`vendor/three/LICENSE`）
- Nyxera0x/cutaway — MIT（`src/geometry.js` のジオメトリ関数、スタジオ照明の構成、JOB_DESCRIPTION / CHECKLIST の方式）
