<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$cookieJar = tempnam(sys_get_temp_dir(), 'mv_cookie_');

function normalize_text(string $value): string
{
    $value = html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $value = preg_replace('/\s+/u', ' ', $value);

    return trim((string) $value);
}

function fetch_url(string $url, array $headers = [], ?string $body = null, string $method = 'GET', ?string $cookieJar = null): string
{
    $ch = curl_init($url);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        CURLOPT_ENCODING => '',
    ]);

    if ($cookieJar) {
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieJar);
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieJar);
    }

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $result = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($result === false || $status >= 400) {
        $message = curl_error($ch) ?: ('HTTP ' . $status);
        curl_close($ch);
        throw new RuntimeException($message);
    }

    curl_close($ch);

    return (string) $result;
}

function parse_articles(string $html): array
{
    if (!preg_match_all('/<article[\s\S]*?<\/article>/', $html, $articleMatches)) {
        return [];
    }

    $items = [];

    foreach ($articleMatches[0] as $article) {
        preg_match('/href="https:\/\/id\.rappytv\.com\/[^"]+">([^<]+)<\/a>/', $article, $userMatch);
        preg_match('/<img[^>]+src="([^"]+)"[^>]+alt="avatar"/', $article, $avatarMatch);
        preg_match('/<div class="text-right">\s*([^<]+)\s*<\/div>/', $article, $dateMatch);
        preg_match('/<div class="h-\[100px\] overflow-y-auto">\s*<p class="mr-3" style="color: #ffffff">\s*([\s\S]*?)\s*<\/p>\s*<\/div>/', $article, $messageMatch);
        preg_match('/href="(https:\/\/id\.rappytv\.com\/[^"]+)"/', $article, $discordMatch);

        $username = normalize_text($userMatch[1] ?? '');
        $avatar = normalize_text($avatarMatch[1] ?? '');
        $date = normalize_text($dateMatch[1] ?? '');
        $message = normalize_text($messageMatch[1] ?? '');
        $discordUrl = normalize_text($discordMatch[1] ?? '');

        $allStars = preg_match_all('/fa-solid fa-star\b/', $article);
        $dimStars = preg_match_all('/fa-solid fa-star opacity-30\b/', $article);
        $stars = max(0, min(5, (int) $allStars - (int) $dimStars));

        if ($date === '' || $message === '') {
            continue;
        }

        $items[] = [
            'username' => $username !== '' ? $username : 'Unknown user',
            'avatar' => $avatar !== '' ? $avatar : 'https://myvouch.es/storage/avatars/default-avatar.png',
            'date' => $date,
            'stars' => $stars,
            'message' => $message,
            'discordUrl' => $discordUrl !== '' ? $discordUrl : '#',
        ];
    }

    return $items;
}

function extract_total_vouches(string $html): int
{
    if (!preg_match('/from\s+(\d+)\s+vouches/i', $html, $match)) {
        return 0;
    }

    return (int) ($match[1] ?? 0);
}

try {
    $profileHtml = fetch_url('https://myvouch.es/aven', [], null, 'GET', $cookieJar);

    $items = parse_articles($profileHtml);
    $totalVouches = extract_total_vouches($profileHtml);

    if ($totalVouches > 0 && count($items) >= $totalVouches) {
        echo json_encode($items, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return;
    }

    if (!preg_match('/data-csrf="([^"]+)"/', $profileHtml, $csrfMatch) || !preg_match('/wire:snapshot="([^"]+)"/', $profileHtml, $snapshotMatch)) {
        if (!$items) {
            throw new RuntimeException('Missing livewire bootstrap data');
        }

        $merged = [];
        foreach ($items as $item) {
            $key = strtolower($item['date'] . '|' . $item['username'] . '|' . $item['message']);
            if (!isset($merged[$key])) {
                $merged[$key] = $item;
            }
        }

        $result = array_values($merged);
        usort($result, static function (array $a, array $b): int {
            return strcmp($b['date'], $a['date']);
        });

        echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return;
    }

    $csrf = html_entity_decode($csrfMatch[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $snapshot = html_entity_decode($snapshotMatch[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');

    for ($i = 0; $i < 60; $i++) {
        $payload = json_encode([
            '_token' => $csrf,
            'components' => [[
                'snapshot' => $snapshot,
                'updates' => new stdClass(),
                'calls' => [[
                    'path' => '',
                    'method' => 'loadMore',
                    'params' => [],
                ]],
            ]],
        ], JSON_UNESCAPED_SLASHES);

        $response = fetch_url(
            'https://myvouch.es/livewire/update',
            [
                'Content-Type: application/json',
                'Accept: application/json, text/plain, */*',
                'X-Livewire: true',
                'X-CSRF-TOKEN: ' . $csrf,
                'X-Requested-With: XMLHttpRequest',
                'Origin: https://myvouch.es',
                'Referer: https://myvouch.es/aven',
            ],
            $payload,
            'POST',
            $cookieJar
        );

        $decoded = json_decode($response, true);
        $component = $decoded['components'][0] ?? null;
        $snapshot = is_array($component) ? (string) ($component['snapshot'] ?? '') : '';
        $effectHtml = is_array($component) ? (string) (($component['effects']['html'] ?? '')) : '';

        if ($snapshot === '' || $effectHtml === '') {
            break;
        }

        $batch = parse_articles($effectHtml);
        if (!$batch) {
            break;
        }

        $items = array_merge($items, $batch);
    }

    $merged = [];
    foreach ($items as $item) {
        $key = strtolower($item['date'] . '|' . $item['username'] . '|' . $item['message']);
        if (!isset($merged[$key])) {
            $merged[$key] = $item;
        }
    }

    $result = array_values($merged);
    usort($result, static function (array $a, array $b): int {
        return strcmp($b['date'], $a['date']);
    });

    echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to load live reviews'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} finally {
    if (is_string($cookieJar) && is_file($cookieJar)) {
        @unlink($cookieJar);
    }
}
