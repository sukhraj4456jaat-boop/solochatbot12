const https = require('https');
const http = require('http');

const EMBEDDING_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/embeddings',
    models: [
      { id: 'text-embedding-3-small', dimensions: 1536, label: 'Embedding 3 Small (cheap, fast)' },
      { id: 'text-embedding-3-large', dimensions: 3072, label: 'Embedding 3 Large (best quality)' },
      { id: 'text-embedding-ada-002', dimensions: 1536, label: 'Ada 002 (legacy)' },
    ],
    defaultModel: 'text-embedding-3-small',
    defaultDimensions: 1536,
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/embeddings',
    models: [
      { id: 'openai/text-embedding-3-small', dimensions: 1536, label: 'OpenAI Embedding 3 Small' },
      { id: 'openai/text-embedding-3-large', dimensions: 3072, label: 'OpenAI Embedding 3 Large' },
    ],
    defaultModel: 'openai/text-embedding-3-small',
    defaultDimensions: 1536,
  },
  custom: {
    name: 'Custom API',
    baseUrl: '',
    models: [],
    defaultModel: '',
    defaultDimensions: 1536,
  },
};

const MAX_BATCH_SIZE = 100;

/**
 * Build config from KnowledgeBase record
 */
function buildEmbeddingConfig(kb) {
  const provider = kb.embeddingProvider || 'openai';
  const providerConfig = EMBEDDING_PROVIDERS[provider] || EMBEDDING_PROVIDERS.openai;

  return {
    provider,
    apiKey: kb.embeddingApiKey || '',
    model: kb.embeddingModel || providerConfig.defaultModel,
    baseUrl: kb.embeddingBaseUrl || providerConfig.baseUrl,
    dimensions: kb.embeddingDimensions || providerConfig.defaultDimensions,
  };
}

/**
 * Get embedding for a single text
 */
async function getEmbedding(text, config) {
  const response = await callEmbeddingAPI([text], config);
  return response[0];
}

/**
 * Get embeddings for multiple texts in batches
 */
async function getEmbeddings(texts, config) {
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const embeddings = await callEmbeddingAPI(batch, config);
    allEmbeddings.push(...embeddings);

    if (i + MAX_BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return allEmbeddings;
}

/**
 * Universal embedding API call
 * Works with OpenAI, OpenRouter, and any OpenAI-compatible custom endpoint
 */
function callEmbeddingAPI(inputs, config) {
  return new Promise((resolve, reject) => {
    if (!config.apiKey) {
      reject(new Error('Embedding API key is not configured'));
      return;
    }

    const url = config.baseUrl;
    if (!url) {
      reject(new Error('Embedding API URL is not configured'));
      return;
    }

    const bodyObj = {
      model: config.model,
      input: inputs,
    };

    if (config.provider === 'openai' && config.model.includes('embedding-3')) {
      bodyObj.dimensions = config.dimensions;
    }

    const body = JSON.stringify({
      ...bodyObj,
    });

    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Length': Buffer.byteLength(body),
    };

    if (config.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://chatbot-saas.railway.app';
    }

    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers,
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Embedding API error (${res.statusCode}): ${parsed.error?.message || data.substring(0, 300)}`));
            return;
          }
          const embeddings = parsed.data
            .sort((a, b) => a.index - b.index)
            .map(d => d.embedding);
          resolve(embeddings);
        } catch (e) {
          reject(new Error(`Failed to parse embedding response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Embedding request timed out')); });
    req.write(body);
    req.end();
  });
}

/**
 * Test an embedding config by sending a small test input
 */
async function testEmbeddingConfig(config) {
  const start = Date.now();
  try {
    const result = await callEmbeddingAPI(['test embedding connection'], config);
    return {
      success: true,
      dimensions: result[0].length,
      latencyMs: Date.now() - start,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      dimensions: 0,
      latencyMs: Date.now() - start,
      error: error.message,
    };
  }
}

/**
 * Rough token counter (fast approximation)
 * ~4 chars per token for English text
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

module.exports = {
  getEmbedding,
  getEmbeddings,
  testEmbeddingConfig,
  buildEmbeddingConfig,
  estimateTokens,
  EMBEDDING_PROVIDERS,
};