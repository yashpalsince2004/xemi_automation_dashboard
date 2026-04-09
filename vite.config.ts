import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { spawn } from "child_process";
import dotenv from "dotenv";

// Load .env from project root so all vars are in process.env before child spawns
dotenv.config({ path: path.resolve(__dirname, '.env') });

// ─── Shared automation state (in-memory, survives across requests) ──────────
let automationState = {
  running: false,
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
  currentFile: '',
  currentSubStatus: '',
  files: [] as Array<{ name: string; status: 'success' | 'failed' | 'processing' | 'pending'; duration?: string; error?: string }>,
  startedAt: null as number | null,
  finishedAt: null as number | null,
};

// SSE clients listening for progress updates
let sseClients: any[] = [];

function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(res => {
    try { res.write(payload); return true; } catch { return false; }
  });
}

function resetAutomationState() {
  automationState = {
    running: false, total: 0, completed: 0, succeeded: 0, failed: 0,
    currentFile: '', currentSubStatus: '', files: [], startedAt: null, finishedAt: null,
  };
}

const autoRunPlugin = () => ({
  name: 'auto-run-plugin',
  configureServer(server: any) {

    // ── SSE endpoint: stream real-time progress ─────────────────────────
    server.middlewares.use('/api/automation-stream', (req: any, res: any) => {
      if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`event: state\ndata: ${JSON.stringify(automationState)}\n\n`);
      sseClients.push(res);
      req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
    });

    // ── GET current status (for initial load) ───────────────────────────
    server.middlewares.use('/api/automation-status', (req: any, res: any) => {
      if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
      if (req.url && !req.url.startsWith('/api/automation-status')) return;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(automationState));
    });

    // ── POST to trigger automation run ──────────────────────────────────
    server.middlewares.use('/api/run-auto', (req: any, res: any) => {
      if (automationState.running) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Automation already running', state: automationState }));
        return;
      }

      resetAutomationState();
      automationState.running = true;
      automationState.startedAt = Date.now();
      broadcastSSE('state', automationState);

      const child = spawn('node', ['auto_export_xl.js'], {
        cwd: path.resolve(__dirname, 'automation/cha_export'),
        env: { ...process.env, HEADLESS: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuf = '';

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdoutBuf += text;
        process.stdout.write(text); // echo to server console

        // Parse line by line to handle multiple markers in a single chunk
        const lines = text.split('\n');
        
        for (const line of lines) {
          // Expected: "[PROGRESS] BATCH_TOTAL=10"
          const totalMatch = line.match(/\[PROGRESS\]\s*BATCH_TOTAL=(\d+)/);
          if (totalMatch) {
            automationState.total = parseInt(totalMatch[1]);
            automationState.files = [];
            broadcastSSE('state', automationState);
          }

          // Expected: "[PROGRESS] FILE_START=filename.xlsx"
          const startMatch = line.match(/\[PROGRESS\]\s*FILE_START=(.+)/);
          if (startMatch) {
            const name = startMatch[1].trim();
            automationState.currentFile = name;
            
            // Prevent duplicates if multiple starts are somehow emitted
            const existing = automationState.files.find(f => f.name === name);
            if (!existing) {
              automationState.files.push({ name, status: 'processing' });
            } else {
              existing.status = 'processing';
            }
            broadcastSSE('state', automationState);
          }

          // Expected: "[PROGRESS] FILE_DONE=filename.xlsx STATUS=success DURATION=12.3s"
          const doneMatch = line.match(/\[PROGRESS\]\s*FILE_DONE=(.+?)\s+STATUS=(success|failed)(?:\s+DURATION=(\S+))?/);
          if (doneMatch) {
            const name = doneMatch[1].trim();
            const status = doneMatch[2] as 'success' | 'failed';
            const duration = doneMatch[3] || '';
            
            // Only increment completed if we're actually marking an existing processing file as done
            // or adding a new completed file. This ensures we don't double-count.
            const fileEntry = automationState.files.find(f => f.name === name);
            if (!fileEntry || fileEntry.status === 'processing' || fileEntry.status === 'pending') {
              automationState.completed++;
              if (status === 'success') automationState.succeeded++;
              else automationState.failed++;
            }
            
            if (fileEntry) { 
              fileEntry.status = status; 
              fileEntry.duration = duration; 
            } else {
              automationState.files.push({ name, status, duration });
            }
            
            automationState.currentFile = '';
            automationState.currentSubStatus = '';
            broadcastSSE('state', automationState);
          } else if (line.match(/^ {4}(\S.*)/) && automationState.currentFile) {
            // General status messages (e.g. "    📄 Converting...")
            const statusMatch = line.match(/^ {4}(\S.*)/);
            if (statusMatch) {
              automationState.currentSubStatus = statusMatch[1].trim();
              broadcastSSE('state', automationState);
            }
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk.toString());
      });

      child.on('close', (code: number) => {
        automationState.running = false;
        automationState.finishedAt = Date.now();
        broadcastSSE('done', automationState);
      });

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, message: 'Automation started' }));
    });

    server.middlewares.use('/api/automation-logs', async (req: any, res: any) => {
      try {
        const fs = await import('fs');
        const logPath = path.resolve(__dirname, 'automation/cha_export/output/error_log.json');
        
        if (!fs.existsSync(logPath)) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, data: { errors: [] } }));
          return;
        }

        const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data }));
      } catch (err: any) {
        console.error("Failed to read automation logs:", err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to read logs' }));
      }
    });

    server.middlewares.use('/api/bulk-compare', async (req: any, res: any) => {
      try {
        const { compareBulk } = await import(path.resolve(__dirname, 'automation/cha_export/sb_compare.js'));
        const { initGoogleDrive } = await import(path.resolve(__dirname, 'automation/cha_export/google_drive.js'));

        const dirA = path.resolve(__dirname, 'automation/cha_export/input_sb');
        const dirB = path.resolve(__dirname, 'automation/cha_export/output_sb');
        const specPath = path.resolve(__dirname, 'public/SB_Tables.xlsx');

        // Ensure local directories exist
        const fs = await import('fs');
        if (!fs.existsSync(dirA)) fs.mkdirSync(dirA, { recursive: true });
        if (!fs.existsSync(dirB)) fs.mkdirSync(dirB, { recursive: true });

        // Check if Google Drive is enabled
        const dotenv = await import('dotenv');
        dotenv.config({ path: path.resolve(__dirname, '.env') });

        if (process.env.USE_GOOGLE_DRIVE === 'true') {
          console.log('📂 Fetching .sb files from Google Drive for comparison...');
          const driveClient = await initGoogleDrive();

          // Fetch input_sb files from Drive folder
          const inputSbFolderId = process.env.GOOGLE_INPUT_SB_FOLDER_ID;
          if (inputSbFolderId) {
            const inputFiles = await driveClient.listFiles(inputSbFolderId);
            const sbFiles = inputFiles.filter((f: any) => f.name.endsWith('.sb') || f.name.endsWith('.txt'));
            console.log(`   📥 Found ${sbFiles.length} input .sb file(s) in Google Drive`);
            
            // Clear local input_sb and download fresh copies
            const existingLocal = fs.readdirSync(dirA);
            for (const f of existingLocal) fs.unlinkSync(path.join(dirA, f));
            
            for (const file of sbFiles) {
              const destPath = path.join(dirA, file.name);
              await driveClient.downloadFile(file.id, destPath);
            }
          }
          
          // Force Vite backend reload to clear cached imports
          const outputSbFolderId = process.env.GOOGLE_OUTPUT_FOLDER_ID;
          if (outputSbFolderId) {
            const outputFiles = await driveClient.listFiles(outputSbFolderId);
            const sbFiles = outputFiles.filter((f: any) => f.name.endsWith('.sb') || f.name.endsWith('.txt'));
            console.log(`   📥 Found ${sbFiles.length} output .sb file(s) in Google Drive`);
            
            // Clear local output_sb and download fresh copies
            const existingLocal = fs.readdirSync(dirB);
            for (const f of existingLocal) fs.unlinkSync(path.join(dirB, f));
            
            for (const file of sbFiles) {
              const destPath = path.join(dirB, file.name);
              await driveClient.downloadFile(file.id, destPath);
            }
          }
        }

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
