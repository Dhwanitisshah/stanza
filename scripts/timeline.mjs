// Loads scripts/timeline.cli.ts through a Vite server, so the TypeScript source (with its "@/" imports and
// the server-only stub) runs unchanged and no extra dependency is needed.
// Usage: npm run timeline -- <fixture-name> [--speed=1] [--format=reel|post]
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));

const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("../tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});

let code = 0;
try {
  const cli = await server.ssrLoadModule("/scripts/timeline.cli.ts");
  code = cli.main(process.argv.slice(2));
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
