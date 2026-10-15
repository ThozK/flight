# 福井、空のさんぽ

福井県全域の航空写真と実際の標高データを使った、ブラウザで楽しめる遊覧飛行です。

公開先: https://ThozK.github.io/flight/

## 操作

- 左右キー・A/D または画面のボタンで旋回
- 飛行速度を85・170・340・680 km/hから選択
- 出発エリアから敦賀・三方五湖・小浜・高浜・大野・勝山など13か所へ移動
- コンビニの光柱はチェックボックスで表示を切り替え
- 前進と高度は自動調整

## 構成と起動

HTML・CSS・JavaScriptとThree.jsによる静的サイトです。バックエンドやビルド処理はありません。

ローカルで確認する場合は、このフォルダで `python3 -m http.server 8000` を実行し、`http://localhost:8000/` を開きます。航空写真・標高の取得にはインターネット接続が必要です。

GitHub Pagesは `main` ブランチの `/ (root)` を公開元に設定します。

周辺49区画の地形を移動に合わせて読み込み、遠い地形を解放します。近景写真は最大8区画を保持し、通信数も制限しています。

## データとライセンス

- 写真・標高：[地理院タイル（国土地理院）](https://maps.gsi.go.jp/development/ichiran.html)
- 店舗位置：[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)、ODbL 1.0
- Three.js：MIT（`THREE-LICENSE.txt`）

`convenience.json` は福井県全域と周辺のOSM登録店舗646件のスナップショットです。取得元の日時・範囲・ライセンスをファイル内に記録しています。未登録店舗、閉店や名称変更の未反映があり得ます。
