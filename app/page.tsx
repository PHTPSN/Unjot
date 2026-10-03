import { redirect } from "next/navigation";

/**
 * 界面用我们自己的前端（apps/web），由 scripts/sync-web-ui.mjs 同步到
 * public/unjot，随 Next 一起发出来。这里只做入口跳转；
 * 上游的 API 路由（app/api/**）与 lib/** 保持不变。
 *
 * 改动前的上游页面留在 work/backup/upstream-ddd8a8e/page.tsx。
 */
export default function Page() {
  redirect("/unjot/index.html");
}

// 原始页面见 work/backup/upstream-ddd8a8e/page.tsx
