const { getEmbedding, getEmbeddings, buildEmbeddingConfig } = require('./embeddings');
const { chunkText } = require('./chunker');
const { parseDocument, scrapeUrl } = require('./documentParser');
const { storeChunks, hybridSearch, deleteDocumentChunks, getKnowledgeBaseStats } = require('./vectorStore');
const { decrypt } = require('./encryption');
const prisma = require('./prisma');

/**
 * Get embedding config for a chatbot's knowledge base
 */
async function getEmbeddingConfig(chatbotId) {
  const kb = await prisma.knowledgeBase.findUnique({
    where: { chatbotId },
  });

  if (!kb) throw new Error('Knowledge base not found');

  let apiKey = '';
  if (kb.embeddingApiKey) {
    apiKey = decrypt(kb.embeddingApiKey);
  }

  if (!apiKey && process.env.EMBEDDING_API_KEY) {
    apiKey = process.env.EMBEDDING_API_KEY;
  }
  if (!apiKey && process.env.OPENAI_API_KEY) {
    apiKey = process.env.OPENAI_API_KEY;
  }

  if (!apiKey) {
    throw new Error('No embedding API key configured. Go to Knowledge Base → Embedding Settings and add your API key.');
  }

  const config = buildEmbeddingConfig(kb);
  config.apiKey = apiKey;
  return config;
}

async function processDocument(documentId) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { knowledgeBase: true },
  });

  if (!doc) throw new Error('Document not found');

  try {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing' },
    });

    console.log(`[RAG] Processing document: ${doc.originalName} (${doc.id})`);

    let text;
    if (doc.sourceType === 'url') {
      text = await scrapeUrl(doc.sourceUrl);
    } else {
      const filePath = doc.filename;
      text = await parseDocument(filePath, doc.mimeType);
    }

    if (!text || text.trim().length < 10) {
      throw new Error('Document produced no extractable text');
    }

    console.log(`[RAG] Extracted ${text.length} chars from ${doc.originalName}`);

    const chunks = chunkText(text, {
      chunkSize: doc.knowledgeBase.chunkSize,
      chunkOverlap: doc.knowledgeBase.chunkOverlap,
    });

    if (chunks.length === 0) {
      throw new Error('Document produced no valid chunks');
    }

    console.log(`[RAG] Created ${chunks.length} chunks`);

    const embeddingConfig = await getEmbeddingConfig(doc.knowledgeBase.chatbotId);
    const chunkTexts = chunks.map(c => c.content);
    const embeddings = await getEmbeddings(chunkTexts, embeddingConfig);

    console.log(`[RAG] Generated ${embeddings.length} embeddings via ${embeddingConfig.provider}`);

    await deleteDocumentChunks(documentId);

    await storeChunks(documentId, chunks, embeddings, {
      documentName: doc.originalName,
      sourceType: doc.sourceType,
    });

    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'processed',
        chunkCount: chunks.length,
        tokenCount: totalTokens,
        errorMessage: '',
      },
    });

    const stats = await getKnowledgeBaseStats(doc.knowledgeBase.chatbotId);
    await prisma.knowledgeBase.update({
      where: { id: doc.knowledgeBaseId },
      data: {
        totalChunks: stats.totalChunks,
        totalTokens: stats.totalTokens,
      },
    });

    console.log(`[RAG] Document processed successfully: ${doc.originalName}`);
    return { success: true, chunks: chunks.length, tokens: totalTokens };
  } catch (error) {
    console.error(`[RAG] Error processing document ${doc.originalName}:`, error.message);

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'error',
        errorMessage: error.message.substring(0, 500),
      },
    });

    throw error;
  }
}

async function retrieveContext(query, chatbotId, options = {}) {
  const {
    topK = 6,
    maxTokenBudget = 2000,
    similarityThreshold = 0.3,
  } = options;

  const kb = await prisma.knowledgeBase.findUnique({
    where: { chatbotId },
  });

  if (!kb || kb.totalChunks === 0) {
    return { context: null, chunks: [], totalTokens: 0 };
  }

  try {
    const embeddingConfig = await getEmbeddingConfig(chatbotId);
    const queryEmbedding = await getEmbedding(query, embeddingConfig);

    const { chunks, totalTokensUsed } = await hybridSearch(
      queryEmbedding,
      chatbotId,
      {
        topK,
        similarityThreshold,
        keywordQuery: query,
        maxTokenBudget,
      }
    );

    if (chunks.length === 0) {
      return { context: null, chunks: [], totalTokens: 0 };
    }

    const contextParts = chunks.map((chunk) => {
      const source = chunk.documentName || 'Unknown';
      return `[Source: ${source}]\n${chunk.content}`;
    });

    const context = `--- RELEVANT KNOWLEDGE BASE CONTEXT ---\n\n${contextParts.join('\n\n---\n\n')}\n\n--- END CONTEXT ---`;

    return {
      context,
      chunks: chunks.map(c => ({
        documentName: c.documentName,
        similarity: c.combinedScore,
        preview: c.content.substring(0, 150) + '...',
      })),
      totalTokens: totalTokensUsed,
    };
  } catch (error) {
    console.error('[RAG] Retrieval error:', error.message);
    return { context: null, chunks: [], totalTokens: 0 };
  }
}

module.exports = { processDocument, retrieveContext, getEmbeddingConfig };