const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

/**
 * Parse a document file into plain text
 */
async function parseDocument(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.pdf':
      return parsePDF(filePath);
    case '.txt':
    case '.md':
    case '.markdown':
      return fs.readFileSync(filePath, 'utf-8');
    case '.csv':
      return parseCSV(filePath);
    case '.json':
      return parseJSON(filePath);
    case '.html':
    case '.htm':
      return parseHTML(fs.readFileSync(filePath, 'utf-8'));
    default:
      return fs.readFileSync(filePath, 'utf-8');
  }
}

/**
 * Parse PDF file
 */
async function parsePDF(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Parse CSV into readable text format
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length === 0) return '';

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1);

  return rows.map(row => {
    const values = row.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return headers.map((h, i) => `${h}: ${values[i] || ''}`).join(' | ');
  }).join('\n');
}

/**
 * Parse JSON into readable text
 */
function parseJSON(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  if (Array.isArray(data)) {
    return data.map(item => {
      if (typeof item === 'string') return item;
      return Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(' | ');
    }).join('\n\n');
  }

  return JSON.stringify(data, null, 2);
}

/**
 * Strip HTML tags and extract text
 */
function parseHTML(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);

  $('script, style, nav, footer, header, aside').remove();

  const text = $('body').text()
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  return text;
}

/**
 * Scrape a URL and extract text content
 */
async function scrapeUrl(url) {
  const html = await fetchUrl(url);
  return parseHTML(html);
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChatbotRAG/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

module.exports = { parseDocument, scrapeUrl };