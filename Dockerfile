# 公式のNode.js 20ランタイムを親イメージとして使用
FROM node:20

ENV DOCKER true
ENV LOG_DIR logs
ENV FIREBASE_SERVICE_ACCOUNT_KEY /usr/src/app/paperwave-firebase-adminsdk.json

# pnpmをインストール
RUN npm install -g pnpm

# コンテナ内の作業ディレクトリを設定
WORKDIR /usr/src/app

# package.jsonとpnpm-lock.yamlをコピーして依存関係をインストール
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 残りのアプリケーションコードをすべてコピー
COPY . .
RUN ["mkdir", "downloads"]
RUN ["mkdir", "logs"]
RUN ["mkdir", "out"]

# mainスクリプトを実行してアプリを起動
# CMD ["ls", "-l", "-a"]
CMD ["pnpm", "run", "main", "--log=debug"]
