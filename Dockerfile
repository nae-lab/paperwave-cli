# 公式のNode.js 20ランタイムを親イメージとして使用
FROM node:20

# pnpmをインストール
RUN npm install -g pnpm

# コンテナ内の作業ディレクトリを設定
WORKDIR /usr/src/app

# package.jsonとpnpm-lock.yamlをコピーして依存関係をインストール
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 残りのアプリケーションコードをすべてコピー
COPY . .

# mainスクリプトを実行してアプリを起動
CMD ["pnpm", "run", "main"]