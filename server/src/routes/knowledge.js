const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../lib/auth');
const { processDocument, getEmbeddingConfig } = require('../lib/ragPipeline');
const { getKnowledgeBaseStats, hybridSearch, deleteDocumentChunks } = require('../lib/vectorStore');
const { getEmbedding, testEmbeddingConfig, EMBEDDING_PROVIDERS } = require('../lib/embeddings');
const { encrypt, decrypt, maskApiKey } = require('../lib/encryption');
const { aiQueue } = require('../lib/queue');

const router = express.Router();
router.use(authMiddleware);

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.md', '.csv', '.json', '.html', '.htm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported. Allowed: ${allowed.join(', ')}`));
    }
  },
});

async function verifyChatbot(chatbotId, adminId) {
  const chatbot = await prisma.chatbot.findFirst({
    where: { id: chatbotId, adminId },
  });
  return chatbot;
}

async function getOrCreateKB(chatbotId) {
  let kb = await prisma.knowledgeBase.findUnique({ where: { chatbotId } });
  if (!kb) {
    kb = await prisma.knowledgeBase.create({
      data: { chatbotId },
    });
  }
  return kb;
}

router.get('/:chatbotId', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const kb = await getOrCreateKB(chatbot.id);
    const stats = await getKnowledgeBaseStats(chatbot.id);

    res.json({ ...kb, ...stats });
  } catch (error) {
    console.error('Get KB error:', error);
    res.status(500).json({ error: 'Failed to get knowledge base' });
  }
});

router.put('/:chatbotId/settings', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const kb = await getOrCreateKB(chatbot.id);
    const { name, description, chunkSize, chunkOverlap } = req.body;

    const updated = await prisma.knowledgeBase.update({
      where: { id: kb.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(chunkSize !== undefined && { chunkSize: Math.max(200, Math.min(2000, chunkSize)) }),
        ...(chunkOverlap !== undefined && { chunkOverlap: Math.max(0, Math.min(500, chunkOverlap)) }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update KB settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/:chatbotId/documents', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const kb = await getOrCreateKB(chatbot.id);

    const documents = await prisma.document.findMany({
      where: { knowledgeBaseId: kb.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        sourceType: true,
        sourceUrl: true,
        status: true,
        errorMessage: true,
        chunkCount: true,
        tokenCount: true,
        createdAt: true,
      },
    });

    res.json(documents);
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

router.post('/:chatbotId/upload', upload.single('file'), async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const kb = await getOrCreateKB(chatbot.id);

    const doc = await prisma.document.create({
      data: {
        filename: req.file.path,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        sourceType: 'file',
        status: 'pending',
        knowledgeBaseId: kb.id,
      },
    });

    aiQueue.add(async () => {
      try {
        await processDocument(doc.id);
      } catch (err) {
        console.error(`[RAG] Background processing failed for ${doc.id}:`, err.message);
      }
    });

    res.status(201).json({
      id: doc.id,
      originalName: doc.originalName,
      status: 'pending',
      message: 'Document uploaded and queued for processing',
    });
  } catch (error) {
    console.error('Upload error:', error);
    if (error.message?.includes('not supported')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

router.post('/:chatbotId/url', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const { url } = req.body;
    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    const kb = await getOrCreateKB(chatbot.id);

    const doc = await prisma.document.create({
      data: {
        filename: url,
        originalName: new URL(url).hostname + new URL(url).pathname,
        mimeType: 'text/html',
        sourceType: 'url',
        sourceUrl: url,
        status: 'pending',
        knowledgeBaseId: kb.id,
      },
    });

    aiQueue.add(async () => {
      try {
        await processDocument(doc.id);
      } catch (err) {
        console.error(`[RAG] Background URL processing failed for ${doc.id}:`, err.message);
      }
    });

    res.status(201).json({
      id: doc.id,
      originalName: doc.originalName,
      sourceUrl: url,
      status: 'pending',
      message: 'URL queued for scraping and processing',
    });
  } catch (error) {
    console.error('Add URL error:', error);
    res.status(500).json({ error: 'Failed to add URL' });
  }
});

router.post('/:chatbotId/text', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const { title, content } = req.body;
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: 'Content must be at least 10 characters' });
    }

    const kb = await getOrCreateKB(chatbot.id);

    const tempPath = path.join(uploadDir, `text-${Date.now()}.txt`);
    fs.writeFileSync(tempPath, content);

    const doc = await prisma.document.create({
      data: {
        filename: tempPath,
        originalName: title || 'Pasted Text',
        mimeType: 'text/plain',
        fileSize: Buffer.byteLength(content),
        sourceType: 'text',
        status: 'pending',
        knowledgeBaseId: kb.id,
      },
    });

    aiQueue.add(async () => {
      try {
        await processDocument(doc.id);
      } catch (err) {
        console.error(`[RAG] Background text processing failed for ${doc.id}:`, err.message);
      }
    });

    res.status(201).json({
      id: doc.id,
      originalName: doc.originalName,
      status: 'pending',
      message: 'Text queued for processing',
    });
  } catch (error) {
    console.error('Add text error:', error);
    res.status(500).json({ error: 'Failed to add text' });
  }
});

router.delete('/:chatbotId/documents/:docId', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const doc = await prisma.document.findFirst({
      where: { id: req.params.docId },
      include: { knowledgeBase: true },
    });

    if (!doc || doc.knowledgeBase.chatbotId !== chatbot.id) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await deleteDocumentChunks(doc.id);
    await prisma.document.delete({ where: { id: doc.id } });

    if (doc.sourceType !== 'url' && fs.existsSync(doc.filename)) {
      fs.unlinkSync(doc.filename);
    }

    const stats = await getKnowledgeBaseStats(chatbot.id);
    await prisma.knowledgeBase.update({
      where: { chatbotId: chatbot.id },
      data: { totalChunks: stats.totalChunks, totalTokens: stats.totalTokens },
    });

    res.json({ message: 'Document deleted' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

router.post('/:chatbotId/reprocess/:docId', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const doc = await prisma.document.findFirst({
      where: { id: req.params.docId },
      include: { knowledgeBase: true },
    });

    if (!doc || doc.knowledgeBase.chatbotId !== chatbot.id) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await prisma.document.update({
      where: { id: doc.id },
      data: { status: 'pending', errorMessage: '' },
    });

    aiQueue.add(async () => {
      try {
        await processDocument(doc.id);
      } catch (err) {
        console.error(`[RAG] Reprocess failed for ${doc.id}:`, err.message);
      }
    });

    res.json({ message: 'Document queued for reprocessing' });
  } catch (error) {
    console.error('Reprocess error:', error);
    res.status(500).json({ error: 'Failed to reprocess document' });
  }
});

router.post('/:chatbotId/search', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const { query, topK = 5 } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const embeddingConfig = await getEmbeddingConfig(chatbot.id);
    const queryEmbedding = await getEmbedding(query, embeddingConfig);

    const results = await hybridSearch(queryEmbedding, chatbot.id, {
      topK,
      keywordQuery: query,
      maxTokenBudget: 3000,
    });

    res.json({
      query,
      results: results.chunks,
      totalTokens: results.totalTokensUsed,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
});

router.get('/:chatbotId/embedding', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const kb = await getOrCreateKB(chatbot.id);

    res.json({
      provider: kb.embeddingProvider,
      model: kb.embeddingModel,
      baseUrl: kb.embeddingBaseUrl,
      dimensions: kb.embeddingDimensions,
      apiKey: kb.embeddingApiKey ? maskApiKey(decrypt(kb.embeddingApiKey)) : '',
      hasKey: !!kb.embeddingApiKey,
      providers: EMBEDDING_PROVIDERS,
    });
  } catch (error) {
    console.error('Get embedding config error:', error);
    res.status(500).json({ error: 'Failed to get embedding config' });
  }
});

router.put('/:chatbotId/embedding', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const kb = await getOrCreateKB(chatbot.id);
    const { provider, model, apiKey, baseUrl, dimensions } = req.body;

    const updateData = {};

    if (provider !== undefined) {
      const validProviders = ['openai', 'openrouter', 'custom'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ error: `Invalid provider. Must be: ${validProviders.join(', ')}` });
      }
      updateData.embeddingProvider = provider;
    }

    if (model !== undefined) updateData.embeddingModel = model;
    if (baseUrl !== undefined) updateData.embeddingBaseUrl = baseUrl;
    if (dimensions !== undefined) {
      updateData.embeddingDimensions = Math.max(128, Math.min(4096, parseInt(dimensions) || 1536));
    }

    if (apiKey !== undefined && apiKey && !apiKey.includes('****')) {
      updateData.embeddingApiKey = encrypt(apiKey);
    }

    const updated = await prisma.knowledgeBase.update({
      where: { id: kb.id },
      data: updateData,
    });

    res.json({
      provider: updated.embeddingProvider,
      model: updated.embeddingModel,
      baseUrl: updated.embeddingBaseUrl,
      dimensions: updated.embeddingDimensions,
      apiKey: updated.embeddingApiKey ? maskApiKey(decrypt(updated.embeddingApiKey)) : '',
      hasKey: !!updated.embeddingApiKey,
      message: 'Embedding config saved',
    });
  } catch (error) {
    console.error('Save embedding config error:', error);
    res.status(500).json({ error: 'Failed to save embedding config' });
  }
});

router.post('/:chatbotId/embedding/test', async (req, res) => {
  try {
    const chatbot = await verifyChatbot(req.params.chatbotId, req.admin.id);
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const kb = await getOrCreateKB(chatbot.id);
    const { provider, model, apiKey, baseUrl, dimensions } = req.body;

    const testConfig = {
      provider: provider || kb.embeddingProvider,
      model: model || kb.embeddingModel,
      baseUrl: baseUrl || kb.embeddingBaseUrl || EMBEDDING_PROVIDERS[provider || kb.embeddingProvider]?.baseUrl || '',
      dimensions: dimensions || kb.embeddingDimensions,
      apiKey: '',
    };

    if (apiKey && !apiKey.includes('****')) {
      testConfig.apiKey = apiKey;
    } else if (kb.embeddingApiKey) {
      testConfig.apiKey = decrypt(kb.embeddingApiKey);
    } else if (process.env.EMBEDDING_API_KEY) {
      testConfig.apiKey = process.env.EMBEDDING_API_KEY;
    } else if (process.env.OPENAI_API_KEY) {
      testConfig.apiKey = process.env.OPENAI_API_KEY;
    }

    if (!testConfig.apiKey) {
      return res.status(400).json({ error: 'No API key provided or saved' });
    }

    const result = await testEmbeddingConfig(testConfig);
    res.json(result);
  } catch (error) {
    console.error('Test embedding error:', error);
    res.status(500).json({ error: 'Test failed: ' + error.message });
  }
});

module.exports = router;