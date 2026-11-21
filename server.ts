import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { analyzeBrainDump } from './src/utils/eisenhowerEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/coach/analyze', (req, res) => {
    try {
      const { brainDump, clientNow, existingTasks } = req.body ?? {};
      if (!brainDump || typeof brainDump !== 'string' || !brainDump.trim()) {
        return res
          .status(400)
          .json({ error: 'Please paste your tasks or message before submitting.' });
      }

      const result = analyzeBrainDump(
        brainDump,
        typeof clientNow === 'string' ? clientNow : undefined,
        Array.isArray(existingTasks) ? existingTasks : undefined
      );

      if (result.tasks.length === 0) {
        return res.status(400).json({
          error:
            'Could not detect any individual tasks. Try listing each item on a new line or separated by commas.',
        });
      }

      return res.json(result);
    } catch (err: any) {
      console.error('Coach analyze error:', err);
      return res.status(500).json({
        error: err?.message || 'Failed to analyze your task list. Please try again.',
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Quadrant server listening on http://localhost:${PORT}`);
  });
}

startServer();
