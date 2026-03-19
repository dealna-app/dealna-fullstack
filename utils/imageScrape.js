const { URL } = require('url');

const MAX_HTML_BYTES = 400000;
const DEFAULT_TIMEOUT_MS = 4000;

function isIPv4(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function isPrivateIPv4(host) {
  if (!isIPv4(host)) return false;
  const parts = host.split('.').map(n => parseInt(n, 10));
  if (parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isPrivateIPv6(host) {
  const h = host.toLowerCase();
  return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
}

function isSafeUrl(raw) {
  if (!raw) return false;
  let u;
  try { u = new URL(raw); } catch (err) { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname;
  if (!host) return false;
  if (host === 'localhost') return false;
  if (isPrivateIPv4(host)) return false;
  if (isPrivateIPv6(host)) return false;
  return true;
}

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseMetaTags(html) {
  const tags = html.match(/<meta\s+[^>]*>/gi) || [];
  const results = [];
  const attrRegex = /([a-zA-Z_:.-]+)\s*=\s*["']([^"']+)["']/g;
  for (const tag of tags) {
    const attrs = {};
    let m;
    while ((m = attrRegex.exec(tag)) !== null) {
      attrs[m[1].toLowerCase()] = m[2];
    }
    if (!attrs.content) continue;
    results.push({
      name: (attrs.name || '').toLowerCase(),
      property: (attrs.property || '').toLowerCase(),
      content: attrs.content,
    });
  }
  return results;
}

function resolveImageUrl(raw, base) {
  const cleaned = decodeHtml(raw).trim();
  if (!cleaned) return '';
  try {
    return new URL(cleaned, base).toString();
  } catch (err) {
    return '';
  }
}

async function readTextWithLimit(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    return res.text();
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > maxBytes) {
      chunks.push(value.slice(0, Math.max(0, maxBytes - (received - value.length))));
      break;
    }
    chunks.push(value);
    if (received >= maxBytes) break;
  }
  const decoder = new TextDecoder('utf-8');
  let text = '';
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
  text += decoder.decode();
  return text;
}

async function fetchOgImage(url, opts = {}) {
  if (!isSafeUrl(url)) return null;
  if (typeof fetch !== 'function') return null;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes || MAX_HTML_BYTES;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'DealnaBot/1.0 (+https://dealna-app.github.io/dealna-frontend/)',
        'accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;
    const html = await readTextWithLimit(res, maxBytes);
    const metas = parseMetaTags(html);
    const priority = [
      'og:image',
      'og:image:url',
      'twitter:image',
      'twitter:image:src',
    ];
    for (const key of priority) {
      const hit = metas.find(m => m.property === key || m.name === key);
      if (hit) {
        const resolved = resolveImageUrl(hit.content, url);
        if (resolved && isSafeUrl(resolved)) return resolved;
      }
    }
    return null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchOgImage };
