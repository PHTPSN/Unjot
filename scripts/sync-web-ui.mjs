/**
 * 把 authored 前端（apps/web）同步到 Next.js 的静态目录（public/unjot）。
 *
 * 前端只有一份源：apps/web（index.html + styles.css + src/**）。
 * Next 应用负责把这份界面发出去（app/page.tsx 重定向到 /unjot/index.html），
 * 上游原有的 API 与 lib 不动。
 *
 * 用法：node scripts/sync-web-ui.mjs
 */

import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repo, "apps", "web");
const target = join(repo, "public", "unjot");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(join(source, "index.html")))) {
  throw new Error("apps/web/index.html 不存在，无法同步");
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

await cp(join(source, "index.html"), join(target, "index.html"));
await cp(join(source, "styles.css"), join(target, "styles.css"));
await cp(join(source, "src"), join(target, "src"), { recursive: true });

const files = await readdir(join(target, "src"), { recursive: true });
console.log(`已同步 ${files.length + 2} 个文件：apps/web → public/unjot`);
