import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { exec } from "child_process";

const autoRunPlugin = () => ({
  name: 'auto-run-plugin',
  configureServer(server: any) {
    server.middlewares.use('/api/run-auto', (req: any, res: any) => {
      exec('node 03_cha_export.js', { cwd: path.resolve(__dirname, 'CHA_Export') }, (err, stdout, stderr) => {
        if (err) {
          console.error(err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message, stderr }));
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, stdout }));
      });
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/xemi_automation_dashboard/',
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), autoRunPlugin(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
