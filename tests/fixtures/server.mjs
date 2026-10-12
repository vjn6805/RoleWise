import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./application.html', import.meta.url));
const submissions = new Map();
const host = '127.0.0.1';
const port = Number(process.env.FIXTURE_PORT || 4174);
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`);
  const key = url.searchParams.get('case') || 'default';
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/application')) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  } else if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
  } else if (url.pathname === '/submissions' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ count: submissions.get(key) || 0 }));
  } else if (url.pathname === '/submit' && request.method === 'POST') {
    // This is a real HTTP submission counter, not a mocked browser request.
    submissions.set(key, (submissions.get(key) || 0) + 1);
    request.resume();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ count: submissions.get(key) }));
  } else {
    response.writeHead(404);
    response.end('Not found');
  }
});
server.listen(port, host, () => console.log(`Application fixture listening on http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
