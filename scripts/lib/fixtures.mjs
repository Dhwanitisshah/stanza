// Loads the named fixture poems (tests/fixtures/poems.ts) into plain Node through a throwaway Vite server.
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

export async function loadFixtures() {
  const server = await createServer({
    root: fileURLToPath(new URL("../..", import.meta.url)),
    configFile: false,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  });
  try {
    const loaded = await server.ssrLoadModule("/tests/fixtures/poems.ts");
    return loaded.FIXTURES;
  } finally {
    await server.close();
  }
}
