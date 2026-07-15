import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import router from './routes.js';
import { startWorker, stopWorker } from './worker.js';

const app = express();
const __dirname = fileURLToPath(new URL('.', import.meta.url));

app.set('trust proxy', config.trustProxyHops);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '32kb' }));
app.use(router);
app.use(express.static(join(__dirname, '..', 'public')));

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[http]', message);
  res.status(500).json({ ok: false, message });
};
app.use(errorHandler);

const server = app.listen(config.port, config.host, () => {
  console.log(`cWBTC faucet listening on http://${config.host}:${config.port}`);
  startWorker();
});

function shutdown(): void {
  stopWorker();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
