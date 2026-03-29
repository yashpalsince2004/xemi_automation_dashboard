import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { exec } from "child_process";

const autoRunPlugin = () => ({
  name: 'auto-run-plugin',
  configureServer(server: any) {
    server.middlewares.use('/api/run-auto', (req: any, res: any) => {
      exec('node Auto_export_xl.js', { cwd: path.resolve(__dirname, 'CHA_Export') }, (err, stdout, stderr) => {
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

    server.middlewares.use('/api/bulk-compare', async (req: any, res: any) => {
      try {
        const { compareBulk } = await import(path.resolve(__dirname, 'CHA_Export/SB_compare.js'));
        // Fallback to output_sb and input_sb or whatever defaults
        const dirA = path.resolve(__dirname, 'CHA_Export/input_sb');
        const dirB = path.resolve(__dirname, 'CHA_Export/output_sb');
        const specPath = path.resolve(__dirname, 'public/SB_Tables.xlsx');
        
        const results = await compareBulk(dirA, dirB, specPath);
        
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: results }));
      } catch (err: any) {
        console.error("Bulk Compare Error:", err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
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
