import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useBots } from '../context/BotContext';
import { useNotifications } from '../context/NotificationContext';
import {
  getKnowledgeBase,
  getDocuments,
  uploadDocument,
  addUrl,
  addText,
  deleteDocument,
  reprocessDocument,
  testSearch,
} from '../lib/knowledgeApi';
import EmbeddingConfig from '../components/EmbeddingConfig';

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    processing: 'bg-blue-50 text-blue-700 border-blue-200',
    processed: 'bg-green-50 text-green-700 border-green-200',
    error: 'bg-red-50 text-red-700 border-red-200',
  };

  const icons = {
    pending: '⏳',
    processing: '⚙️',
    processed: '✓',
    error: '✕',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.pending}`}>
      <span>{icons[status] || '•'}</span>
      {status}
    </span>
  );
}

function FileUploadZone({ onUpload, uploading }) {
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onUpload(files, setProgress);
  }, [onUpload]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) onUpload(files, setProgress);
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
        ${dragOver
          ? 'border-indigo-400 bg-indigo-50'
          : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      onClick={() => document.getElementById('kb-file-input').click()}
    >
      <input
        id="kb-file-input"
        type="file"
        multiple
        accept=".pdf,.txt,.md,.csv,.json,.html,.htm"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">
            {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            PDF, TXT, Markdown, CSV, JSON, HTML — up to 20MB each
          </p>
        </div>
      </div>

      {uploading && progress > 0 && (
        <div className="mt-4 w-full max-w-xs mx-auto">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{progress}%</p>
        </div>
      )}
    </div>
  );
}

function UrlInput({ onAdd, loading }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim() || !url.startsWith('http')) return;
    onAdd(url.trim());
    setUrl('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex-1 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/faq"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
          disabled={loading}
        />
      </div>
      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Adding...' : 'Scrape URL'}
      </button>
    </form>
  );
}

function TextInputModal({ open, onClose, onAdd, loading }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim() || content.trim().length < 10) return;
    onAdd(title.trim(), content.trim());
    setTitle('');
    setContent('');
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Text Content</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Return Policy, FAQ, Product Info"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your text content here..."
              rows={8}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{content.length} characters</p>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || content.trim().length < 10}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Adding...' : 'Add to Knowledge Base'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DocumentRow({ doc, onDelete, onReprocess, deleting }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const typeIcons = {
    file: '📄',
    url: '🌐',
    text: '📝',
  };

  return (
    <div className="group flex items-center gap-4 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeIcons[doc.sourceType] || '📄'}</span>
          <p className="text-sm font-medium text-gray-800 truncate">{doc.originalName}</p>
        </div>
        {doc.sourceUrl && (
          <p className="text-xs text-gray-400 truncate ml-7">{doc.sourceUrl}</p>
        )}
        {doc.errorMessage && doc.status === 'error' && (
          <p className="text-xs text-red-500 ml-7 mt-0.5">{doc.errorMessage}</p>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-6 text-xs text-gray-400">
        <span>{doc.chunkCount} chunks</span>
        <span>{doc.tokenCount?.toLocaleString()} tokens</span>
        <span>{formatSize(doc.fileSize)}</span>
        <span>{formatDate(doc.createdAt)}</span>
      </div>

      <StatusBadge status={doc.status} />

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {(doc.status === 'error' || doc.status === 'processed') && (
          <button
            onClick={() => onReprocess(doc.id)}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Reprocess"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { onDelete(doc.id); setConfirmDelete(false); }}
              disabled={deleting}
              className="px-2 py-1 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              {deleting ? '...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function SearchPanel({ chatbotId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    try {
      const data = await testSearch(chatbotId, query.trim());
      setResults(data);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="p-5 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <span>🔍</span> Test Retrieval
        </h3>
        <p className="text-xs text-gray-400 mt-1">Ask a question to see which chunks the RAG system retrieves</p>
      </div>

      <div className="p-5">
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. What is the return policy?"
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {searching ? '...' : 'Search'}
          </button>
        </form>

        {results && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              {results.results.length} chunks retrieved · {results.totalTokens} tokens used
            </p>

            {results.results.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                No relevant chunks found. Try a different query or add more documents.
              </div>
            ) : (
              results.results.map((chunk, i) => (
                <div key={chunk.id || i} className="border border-gray-100 rounded-lg p-4 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md">#{i + 1}</span>
                      <span className="text-xs text-gray-500">{chunk.documentName}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      similarity: <span className="font-mono text-indigo-600">{(chunk.similarity * 100).toFixed(1)}%</span>
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{chunk.content || chunk.preview}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function KnowledgeBase() {
  const { botId } = useParams();
  const { bots, activeBot } = useBots();
  const currentBot = bots.find((bot) => bot.id === botId) || activeBot;
  const [kb, setKb] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addingUrl, setAddingUrl] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [addingText, setAddingText] = useState(false);
  const [activeTab, setActiveTab] = useState('documents');
  const { notify } = useNotifications();

  const chatbotId = currentBot?.id || botId;

  const loadData = useCallback(async () => {
    if (!chatbotId) return;
    try {
      const [kbData, docsData] = await Promise.all([
        getKnowledgeBase(chatbotId),
        getDocuments(chatbotId),
      ]);
      setKb(kbData);
      setDocuments(docsData);
    } catch (err) {
      console.error('Failed to load KB data:', err);
    } finally {
      setLoading(false);
    }
  }, [chatbotId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'pending' || d.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [documents, loadData]);

  const handleUpload = async (files, setProgress) => {
    setUploading(true);
    try {
      for (const file of files) {
        await uploadDocument(chatbotId, file, setProgress);
      }
      notify.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded and queued for processing`);
      await loadData();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Upload failed';
      notify.error(`Upload failed: ${errorMsg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async (url) => {
    setAddingUrl(true);
    try {
      await addUrl(chatbotId, url);
      notify.success('URL queued for scraping and processing');
      await loadData();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to add URL';
      notify.error(`URL failed: ${errorMsg}`);
    } finally {
      setAddingUrl(false);
    }
  };

  const handleAddText = async (title, content) => {
    setAddingText(true);
    try {
      await addText(chatbotId, title, content);
      notify.success('Text content queued for processing');
      setShowTextModal(false);
      await loadData();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to add text';
      notify.error(`Text failed: ${errorMsg}`);
    } finally {
      setAddingText(false);
    }
  };

  const handleDelete = async (docId) => {
    setDeletingId(docId);
    try {
      await deleteDocument(chatbotId, docId);
      notify.success('Document deleted from knowledge base');
      await loadData();
    } catch (err) {
      notify.error('Failed to delete document. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleReprocess = async (docId) => {
    try {
      await reprocessDocument(chatbotId, docId);
      notify.info('Document queued for reprocessing');
      await loadData();
    } catch (err) {
      notify.error('Failed to reprocess document. Check your embedding API key.');
    }
  };

  if (!chatbotId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Select a chatbot to manage its knowledge base
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="w-8 h-8 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
        </svg>
      </div>
    );
  }

  const processedDocs = documents.filter(d => d.status === 'processed').length;
  const processingDocs = documents.filter(d => d.status === 'pending' || d.status === 'processing').length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Train your chatbot with documents, URLs, and custom text
          </p>
        </div>
        <button
          onClick={() => setShowTextModal(true)}
          className="px-4 py-2 bg-white border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center gap-2"
        >
          <span>📝</span> Add Text
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon="📄" label="Documents" value={documents.length} sub={processingDocs > 0 ? `${processingDocs} processing` : undefined} />
        <StatCard icon="🧩" label="Chunks" value={kb?.totalChunks?.toLocaleString() || 0} />
        <StatCard icon="🔤" label="Tokens" value={kb?.totalTokens?.toLocaleString() || 0} />
        <StatCard icon="✅" label="Ready" value={`${processedDocs}/${documents.length}`} />
      </div>

      <FileUploadZone onUpload={handleUpload} uploading={uploading} />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span>🌐</span> Add from URL
        </h3>
        <UrlInput onAdd={handleAddUrl} loading={addingUrl} />
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all
            ${activeTab === 'documents' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Documents ({documents.length})
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all
            ${activeTab === 'search' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Test Search
        </button>
        <button
          onClick={() => setActiveTab('embedding')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all
            ${activeTab === 'embedding' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Embedding Config
        </button>
      </div>

      {activeTab === 'documents' ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          {documents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">📚</p>
              <p className="text-sm text-gray-500">No documents yet</p>
              <p className="text-xs text-gray-400 mt-1">Upload files, add URLs, or paste text to build your knowledge base</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {documents.map(doc => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  onDelete={handleDelete}
                  onReprocess={handleReprocess}
                  deleting={deletingId === doc.id}
                />
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'search' ? (
        <SearchPanel chatbotId={chatbotId} />
      ) : (
        <EmbeddingConfig chatbotId={chatbotId} />
      )}

      <TextInputModal
        open={showTextModal}
        onClose={() => setShowTextModal(false)}
        onAdd={handleAddText}
        loading={addingText}
      />
    </div>
  );
}