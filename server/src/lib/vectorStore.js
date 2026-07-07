const prisma = require('./prisma');

/**
 * Store a chunk with its embedding vector
 */
async function storeChunk(documentId, content, embedding, chunkIndex, tokenCount, metadata = {}) {
  const vectorStr = `[${embedding.join(',')}]`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "DocumentChunk" (id, content, "tokenCount", "chunkIndex", metadata, embedding, "createdAt", "documentId")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, NOW(), $6)`,
    content,
    tokenCount,
    chunkIndex,
    JSON.stringify(metadata),
    vectorStr,
    documentId
  );
}

/**
 * Store multiple chunks at once (batch insert)
 */
async function storeChunks(documentId, chunks, embeddings, metadata = {}) {
  const operations = chunks.map((chunk, i) => {
    const vectorStr = `[${embeddings[i].join(',')}]`;
    return prisma.$executeRawUnsafe(
      `INSERT INTO "DocumentChunk" (id, content, "tokenCount", "chunkIndex", metadata, embedding, "createdAt", "documentId")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, NOW(), $6)`,
      chunk.content,
      chunk.tokenCount,
      chunk.chunkIndex,
      JSON.stringify({ ...metadata, chunkIndex: chunk.chunkIndex }),
      vectorStr,
      documentId
    );
  });

  for (let i = 0; i < operations.length; i += 50) {
    await Promise.all(operations.slice(i, i + 50));
  }
}

/**
 * Hybrid search: vector similarity + keyword matching
 * Returns top-K most relevant chunks for a chatbot
 */
async function hybridSearch(queryEmbedding, chatbotId, options = {}) {
  const {
    topK = 6,
    similarityThreshold = 0.3,
    keywordQuery = null,
    maxTokenBudget = 2000,
  } = options;

  const vectorStr = `[${queryEmbedding.join(',')}]`;

  let query;
  let params;

  if (keywordQuery && keywordQuery.trim()) {
    const tsQuery = keywordQuery
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean)
      .join(' | ');

    query = `
      SELECT
        dc.id,
        dc.content,
        dc."tokenCount",
        dc."chunkIndex",
        dc.metadata,
        dc."documentId",
        d."originalName" as "documentName",
        1 - (dc.embedding <=> $1::vector) as similarity,
        ts_rank_cd(to_tsvector('english', dc.content), to_tsquery('english', $4)) as keyword_score,
        (0.7 * (1 - (dc.embedding <=> $1::vector)) + 0.3 * COALESCE(ts_rank_cd(to_tsvector('english', dc.content), to_tsquery('english', $4)), 0)) as combined_score
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      JOIN "KnowledgeBase" kb ON d."knowledgeBaseId" = kb.id
      WHERE kb."chatbotId" = $2
        AND d.status = 'processed'
        AND 1 - (dc.embedding <=> $1::vector) >= $3
      ORDER BY combined_score DESC
      LIMIT $5
    `;
    params = [vectorStr, chatbotId, similarityThreshold, tsQuery || 'a', topK * 2];
  } else {
    query = `
      SELECT
        dc.id,
        dc.content,
        dc."tokenCount",
        dc."chunkIndex",
        dc.metadata,
        dc."documentId",
        d."originalName" as "documentName",
        1 - (dc.embedding <=> $1::vector) as similarity,
        0 as keyword_score,
        1 - (dc.embedding <=> $1::vector) as combined_score
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      JOIN "KnowledgeBase" kb ON d."knowledgeBaseId" = kb.id
      WHERE kb."chatbotId" = $2
        AND d.status = 'processed'
        AND 1 - (dc.embedding <=> $1::vector) >= $3
      ORDER BY combined_score DESC
      LIMIT $4
    `;
    params = [vectorStr, chatbotId, similarityThreshold, topK * 2];
  }

  const results = await prisma.$queryRawUnsafe(query, ...params);

  const selected = [];
  let usedTokens = 0;

  for (const chunk of results) {
    if (usedTokens + chunk.tokenCount > maxTokenBudget) {
      if (selected.length >= 2) break;
    }
    selected.push({
      id: chunk.id,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      chunkIndex: chunk.chunkIndex,
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      similarity: parseFloat(chunk.similarity) || 0,
      keywordScore: parseFloat(chunk.keyword_score) || 0,
      combinedScore: parseFloat(chunk.combined_score) || 0,
      metadata: chunk.metadata,
    });
    usedTokens += chunk.tokenCount;

    if (selected.length >= topK) break;
  }

  return { chunks: selected, totalTokensUsed: usedTokens };
}

/**
 * Delete all chunks for a document
 */
async function deleteDocumentChunks(documentId) {
  await prisma.$executeRawUnsafe(
    'DELETE FROM "DocumentChunk" WHERE "documentId" = $1',
    documentId
  );
}

/**
 * Get chunk count for a knowledge base
 */
async function getKnowledgeBaseStats(chatbotId) {
  const result = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(dc.id)::int as "totalChunks",
      COALESCE(SUM(dc."tokenCount"), 0)::int as "totalTokens",
      COUNT(DISTINCT d.id)::int as "totalDocuments"
    FROM "DocumentChunk" dc
    JOIN "Document" d ON dc."documentId" = d.id
    JOIN "KnowledgeBase" kb ON d."knowledgeBaseId" = kb.id
    WHERE kb."chatbotId" = $1
      AND d.status = 'processed'
  `, chatbotId);

  return result[0] || { totalChunks: 0, totalTokens: 0, totalDocuments: 0 };
}

module.exports = {
  storeChunk,
  storeChunks,
  hybridSearch,
  deleteDocumentChunks,
  getKnowledgeBaseStats,
};