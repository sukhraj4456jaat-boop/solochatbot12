const { estimateTokens } = require('./embeddings');

/**
 * Recursive text splitter
 * Splits text into chunks respecting paragraph/sentence boundaries
 */
function chunkText(text, options = {}) {
  const {
    chunkSize = 600,
    chunkOverlap = 100,
    minChunkSize = 50,
  } = options;

  if (!text || !text.trim()) return [];

  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  const targetChars = chunkSize * 4;
  const overlapChars = chunkOverlap * 4;
  const minChars = minChunkSize * 4;

  const separators = [
    '\n\n\n',
    '\n\n',
    '\n',
    '. ',
    '? ',
    '! ',
    '; ',
    ', ',
    ' ',
  ];

  const chunks = recursiveSplit(cleanText, separators, targetChars, overlapChars, minChars);

  return chunks.map((content, index) => ({
    content: content.trim(),
    chunkIndex: index,
    tokenCount: estimateTokens(content),
  }));
}

function recursiveSplit(text, separators, targetChars, overlapChars, minChars) {
  if (text.length <= targetChars) {
    return text.length >= minChars ? [text] : [];
  }

  let bestSep = null;
  for (const sep of separators) {
    if (text.includes(sep)) {
      bestSep = sep;
      break;
    }
  }

  if (!bestSep) {
    return hardSplit(text, targetChars, overlapChars, minChars);
  }

  const parts = text.split(bestSep);
  const chunks = [];
  let currentChunk = '';

  for (const part of parts) {
    const combined = currentChunk ? currentChunk + bestSep + part : part;

    if (combined.length <= targetChars) {
      currentChunk = combined;
    } else {
      if (currentChunk.length >= minChars) {
        chunks.push(currentChunk);
      }

      if (part.length > targetChars) {
        const remainingSeps = separators.slice(separators.indexOf(bestSep) + 1);
        const subChunks = recursiveSplit(part, remainingSeps, targetChars, overlapChars, minChars);
        chunks.push(...subChunks);
        currentChunk = '';
      } else {
        currentChunk = part;
      }
    }
  }

  if (currentChunk.length >= minChars) {
    chunks.push(currentChunk);
  }

  return applyOverlap(chunks, overlapChars);
}

function hardSplit(text, targetChars, overlapChars, minChars) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + targetChars, text.length);

    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start + targetChars * 0.5) {
        end = lastSpace;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length >= minChars) {
      chunks.push(chunk);
    }

    start = end - overlapChars;
    if (start >= text.length) break;
  }

  return chunks;
}

function applyOverlap(chunks, overlapChars) {
  if (chunks.length <= 1 || overlapChars <= 0) return chunks;

  const result = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];
    const overlapText = prevChunk.slice(-overlapChars);

    const breakPoint = overlapText.indexOf(' ');
    const cleanOverlap = breakPoint > 0 ? overlapText.slice(breakPoint + 1) : overlapText;

    result.push(cleanOverlap + ' ' + chunks[i]);
  }

  return result;
}

module.exports = { chunkText };