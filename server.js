const http = require('http');
const https = require('https');
const { readFileSync, existsSync, statSync } = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8000;

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

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function requestText(url, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (response) => {
        const statusCode = response.statusCode || 0;
        const location = response.headers.location;

        if (statusCode >= 300 && statusCode < 400 && location && redirectCount < 5) {
          response.resume();
          const nextUrl = new URL(location, url).toString();
          requestText(nextUrl, options, redirectCount + 1).then(resolve, reject);
          return;
        }

        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (statusCode >= 400) {
            reject(new Error(`HTTP ${statusCode}`));
            return;
          }
          resolve({ body, headers: response.headers });
        });
      }
    );

    request.on('error', reject);

    if (options.body) {
      request.write(options.body);
    }

    request.end();
  });
}

function parseArticles(html) {
  const articles = String(html || '').match(/<article[\s\S]*?<\/article>/g) || [];

  return articles
    .map((article) => {
      const userMatch = article.match(/href="https:\/\/id\.rappytv\.com\/[^"]+">([^<]+)<\/a>/);
      const avatarMatch = article.match(/<img[^>]+src="([^"]+)"[^>]+alt="avatar"/);
      const dateMatch = article.match(/<div class="text-right">\s*([^<]+)\s*<\/div>/);
      const messageMatch = article.match(
        /<div class="h-\[100px\] overflow-y-auto">\s*<p class="mr-3" style="color: #ffffff">\s*([\s\S]*?)\s*<\/p>\s*<\/div>/
      );
      const discordMatch = article.match(/href="(https:\/\/id\.rappytv\.com\/[^"]+)"/);

      const allSolidStars = (article.match(/fa-solid fa-star\b/g) || []).length;
      const dimSolidStars = (article.match(/fa-solid fa-star opacity-30\b/g) || []).length;
      const stars = Math.max(0, Math.min(5, allSolidStars - dimSolidStars));

      return {
        username: normalizeText(userMatch && userMatch[1]) || 'Unknown user',
        avatar: normalizeText(avatarMatch && avatarMatch[1]) || 'https://myvouch.es/storage/avatars/default-avatar.png',
        date: normalizeText(dateMatch && dateMatch[1]),
        stars,
        message: normalizeText(messageMatch && messageMatch[1]),
        discordUrl: normalizeText(discordMatch && discordMatch[1]) || '#',
      };
    })
    .filter((item) => item.date && item.message);
}

function extractTotalVouches(html) {
  const match = String(html || '').match(/from\s+(\d+)\s+vouches/i);
  if (!match) {
    return 0;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeItems(items) {
  const merged = new Map();

  items.forEach((item) => {
    const key = `${item.date}|${item.username.toLowerCase()}|${item.message.toLowerCase()}`;
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  });

  return Array.from(merged.values()).sort((a, b) => b.date.localeCompare(a.date));
}

async function fetchLiveReviews() {
  const profileResponse = await requestText('https://myvouch.es/aven', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'identity',
    },
  });
  const profileHtml = profileResponse.body;
  const cookieHeader = (profileResponse.headers['set-cookie'] || [])
    .map((value) => String(value).split(';')[0])
    .join('; ');

  const csrfMatch = profileHtml.match(/data-csrf="([^"]+)"/);
  const snapshotMatch = profileHtml.match(/wire:snapshot="([^"]+)"/);
  let items = parseArticles(profileHtml);
  const totalVouches = extractTotalVouches(profileHtml);

  if (totalVouches > 0 && items.length >= totalVouches) {
    return dedupeItems(items);
  }

  if (!csrfMatch || !snapshotMatch) {
    const result = dedupeItems(items);
    if (!result.length) {
      throw new Error('Missing livewire bootstrap data');
    }
    return result;
  }

  let snapshot = snapshotMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&');
  const csrf = csrfMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&');

  for (let i = 0; i < 60; i += 1) {
    const body = JSON.stringify({
      _token: csrf,
      components: [
        {
          snapshot,
          updates: {},
          calls: [{ path: '', method: 'loadMore', params: [] }],
        },
      ],
    });

    const response = await requestText('https://myvouch.es/livewire/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'Accept-Encoding': 'identity',
        'X-Livewire': 'true',
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'https://myvouch.es',
        Referer: 'https://myvouch.es/aven',
        'User-Agent': 'Mozilla/5.0',
        Cookie: cookieHeader,
      },
      body,
    });

    const responseJson = JSON.parse(response.body);
    const component = responseJson && responseJson.components && responseJson.components[0];
    const effectHtml = component && component.effects && component.effects.html;
    snapshot = (component && component.snapshot) || '';

    if (!snapshot || !effectHtml) {
      break;
    }

    const batch = parseArticles(effectHtml);
    if (!batch.length) {
      break;
    }

    items = items.concat(batch);
  }

  return dedupeItems(items);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end(JSON.stringify(payload));
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (pathname === '/api/reviews' || pathname === '/reviews/myvouches-proxy.php')) {
    fetchLiveReviews()
      .then((items) => sendJson(res, 200, items))
      .catch(() => sendJson(res, 502, { error: 'Failed to load live reviews' }));
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
