const http = require('http');
const { readFileSync, existsSync, statSync } = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8000;

// Stripe is only initialized if a secret key is configured. This lets the
// static site keep working locally even before Stripe is wired up.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const SITE_URL = process.env.SITE_URL || 'https://veyloservices.com';

let stripe = null;
if (STRIPE_SECRET_KEY) {
  // eslint-disable-next-line global-require
  stripe = require('stripe')(STRIPE_SECRET_KEY);
}

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleCreateCheckoutSession(req, res) {
  if (!stripe) {
    sendJson(res, 500, {
      error: 'Stripe is not configured. Set STRIPE_SECRET_KEY (and STRIPE_PRICE_ID) as environment variables.',
    });
    return;
  }

  if (!STRIPE_PRICE_ID) {
    sendJson(res, 500, { error: 'STRIPE_PRICE_ID is not configured.' });
    return;
  }

  try {
    await readBody(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${SITE_URL}/success/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/store/product/pc-tweaks/`,
    });

    sendJson(res, 200, { url: session.url });
  } catch (err) {
    sendJson(res, 500, { error: 'Failed to create checkout session.' });
  }
}

function safeResolvePath(rootDir, requestPath) {
  const decoded = decodeURIComponent(requestPath || '/');
  const cleanPath = decoded.split('?')[0].split('#')[0];
  const withoutNull = cleanPath.replace(/\0/g, '');
  const withoutTraversal = withoutNull.replace(/^(\.\.(\/|\\|$))+/, '');
  const absolutePath = path.resolve(rootDir, `.${withoutTraversal}`);

  if (!absolutePath.startsWith(rootDir)) {
    return null;
  }
  return absolutePath;
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url || '/';
  const pathname = reqUrl.split('?')[0] || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/create-checkout-session') {
    handleCreateCheckoutSession(req, res);
    return;
  }

  const rootDir = path.resolve(__dirname);
  let filePath = safeResolvePath(rootDir, pathname === '/' ? '/index.html' : pathname);

  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  try {
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!path.extname(filePath) && !existsSync(filePath)) {
      filePath += '.html';
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    if (existsSync(filePath)) {
      const content = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 - Not Found</h1>');
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>500 - Server Error</h1>');
  }
});

server.listen(PORT, () => {
  process.stdout.write(`Server running at http://localhost:${PORT}/\n`);
});
