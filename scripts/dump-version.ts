import { execSync } from "child_process";

// pnpm list --depth 0 の出力を取得
const output = execSync("pnpm list --depth 0 --json", { encoding: "utf-8" });
const packages = JSON.parse(output);

// パッケージのバージョンのみを出力
packages.forEach((pkg: any) => {
  console.log(pkg.version);
});
