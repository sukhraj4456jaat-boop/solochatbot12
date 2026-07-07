import { useState, useEffect } from 'react';
import { getEmbeddingConfig, saveEmbeddingConfig, testEmbeddingConnection } from '../lib/knowledgeApi';
import { useNotifications } from '../context/NotificationContext';

const PROVIDER_OPTIONS = [
  { id: 'openai', name: 'OpenAI', icon: '🟢' },
  { id: 'openrouter', name: 'OpenRouter', icon: '🔀' },
  { id: 'custom', name: 'Custom API', icon: '⚙️' },
];

export default function EmbeddingConfig({ chatbotId }) {
  const [config, setConfig] = useState({
    provider: 'openai',
    model: 'text-embedding-3-small',
    apiKey: '',
    baseUrl: '',
    dimensions: 1536,
  });
  const [providers, setProviders] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const { notify } = useNotifications();

  useEffect(() => {
    if (!chatbotId) return;
    (async () => {
      try {
        const data = await getEmbeddingConfig(chatbotId);
        setConfig({
          provider: data.provider,
          model: data.model,
          apiKey: data.apiKey || '',
          baseUrl: data.baseUrl || '',
          dimensions: data.dimensions,
        });
        setProviders(data.providers || {});
      } catch (err) {
        console.error('Failed to load embedding config:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [chatbotId]);

  const handleProviderChange = (provider) => {
    const pConfig = providers[provider];
    setConfig(prev => ({
      ...prev,
      provider,
      model: pConfig?.defaultModel || '',
      baseUrl: provider === 'custom' ? prev.baseUrl : (pConfig?.baseUrl || ''),
      dimensions: pConfig?.defaultDimensions || 1536,
    }));
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveEmbeddingConfig(chatbotId, config);
      notify.success('Embedding configuration saved');
    } catch (err) {
      notify.error(`Failed to save: ${err.response?.data?.error || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testEmbeddingConnection(chatbotId, config);
      setTestResult(result);
      if (result.success) {
        notify.success(`Connection successful: ${result.dimensions} dimensions, ${result.latencyMs}ms`);
      } else {
        notify.error(`Connection failed: ${result.error}`);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setTestResult({ success: false, error: errorMsg });
      notify.error(`Test failed: ${errorMsg}`);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400 text-sm">Loading embedding config...</div>;
  }

  const currentProviderModels = providers[config.provider]?.models || [];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">

      <div className="p-5 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <span>🧠</span> Embedding Configuration
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          Choose which AI provider converts your documents into searchable vectors
        </p>
      </div>

      <div className="p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
          <div className="grid grid-cols-3 gap-2">
            {PROVIDER_OPTIONS.map(p => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all
                  ${config.provider === p.id
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
              >
                <span>{p.icon}</span>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
            placeholder={config.provider === 'openai' ? 'sk-...' : 'Enter API key'}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
          {currentProviderModels.length > 0 ? (
            <select
              value={config.model}
              onChange={(e) => {
                const selected = currentProviderModels.find(m => m.id === e.target.value);
                setConfig(prev => ({
                  ...prev,
                  model: e.target.value,
                  dimensions: selected?.dimensions || prev.dimensions,
                }));
              }}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white"
            >
              {currentProviderModels.map(m => (
                <option key={m.id} value={m.id}>{m.label} ({m.dimensions}d)</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
              placeholder="e.g. text-embedding-3-small"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          )}
        </div>

        {config.provider === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
            <input
              type="url"
              value={config.baseUrl}
              onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://your-api.com/v1/embeddings"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
        )}

        {config.provider === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vector Dimensions</label>
            <input
              type="number"
              value={config.dimensions}
              onChange={(e) => setConfig(prev => ({ ...prev, dimensions: parseInt(e.target.value) || 1536 }))}
              min={128}
              max={4096}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
        )}

        {testResult && (
          <div className={`p-4 rounded-lg border text-sm ${testResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {testResult.success ? (
              <div className="flex items-center gap-4">
                <span className="text-lg">✅</span>
                <div>
                  <p className="font-medium">Connection successful</p>
                  <p className="text-xs mt-0.5 opacity-75">{testResult.dimensions} dimensions · {testResult.latencyMs}ms latency</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <span className="text-lg">❌</span>
                <div>
                  <p className="font-medium">Connection failed</p>
                  <p className="text-xs mt-0.5 opacity-75">{testResult.error}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleTest}
            disabled={testing || !config.apiKey}
            className="px-4 py-2.5 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {testing ? 'Testing...' : '🧪 Test Connection'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      </div>
    </div>
  );
}