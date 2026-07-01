const http = require('http');
const https = require('https');

const PORT = 8787;
const HOST = '127.0.0.1';
function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchText(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 400) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }
          resolve({
            body,
            headers: response.headers,
          });
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
  const articles = html.match(/<article[\s\S]*?<\/article>/g) || [];

  return articles
    .map((article) => {
      const userMatch = article.match(/href="https:\/\/id\.rappytv\.com\/[^"]+">([^<]+)<\/a>/);
      const avatarMatch = article.match(/<img[^>]+src="([^"]+)"[^>]+alt="avatar"/);
      const dateMatch = article.match(/<div class="text-right">\s*([^<]+)\s*<\/div>/);
      const messageMatch = article.match(/<div class="h-\[100px\] overflow-y-auto">\s*<p class="mr-3" style="color: #ffffff">\s*([\s\S]*?)\s*<\/p>\s*<\/div>/);
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
  const profileResponse = await fetchText('https://myvouch.es/aven', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

    const response = await fetchText('https://myvouch.es/livewire/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
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

  const result = dedupeItems(items);
  return result;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(JSON.stringify(payload));
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    response.end();
    return;
  }

  if (request.url && request.url.startsWith('/reviews')) {
    try {
      const items = await fetchLiveReviews();
      sendJson(response, 200, items);
    } catch (error) {
      sendJson(response, 502, { error: 'Failed to load live reviews' });
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`myvouches local proxy listening on http://${HOST}:${PORT}\n`);
});
