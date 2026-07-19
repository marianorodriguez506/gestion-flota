import { cp, mkdir, copyFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await copyFile("index.html", "dist/index.html");
await copyFile("styles.css", "dist/styles.css");
await copyFile("app.js", "dist/app.js");
await copyFile("supabase-config.js", "dist/supabase-config.js");
await copyFile("manifest.webmanifest", "dist/manifest.webmanifest");
await copyFile("sw.js", "dist/sw.js");
await cp("assets", "dist/assets", { recursive: true, force: true }).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
