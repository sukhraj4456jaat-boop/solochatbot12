import { useState } from 'react';
import { setKnowledgeMode } from '../lib/knowledgeApi';

export default function KnowledgeModeToggle({ chatbotId, currentMode, onModeChange }) {
  const [mode, setMode] = useState(currentMode || 'simple');
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(null);

  const handleSwitch = async (newMode) => {
    if (newMode === mode) return;
    setSwitching(true);
    setError(null);

    try {
      const result = await setKnowledgeMode(chatbotId, newMode);
      setMode(result.knowledgeMode);
      if (onModeChange) onModeChange(result.knowledgeMode);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to switch mode';
      setError(msg);
      setTimeout(() => setError(null), 5000);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Knowledge Source</h3>
          <p className="text-xs text-gray-400 mt-0.5">Choose how your chatbot gets its knowledge</p>
        </div>
        {switching && (
          <svg className="w-5 h-5 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
          </svg>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleSwitch('simple')}
          disabled={switching}
          className={`relative flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${mode === 'simple' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'} ${switching ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {mode === 'simple' && <span className="absolute top-3 right-3 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span>}
          <span className="text-2xl mb-2">📝</span>
          <span className="text-sm font-semibold text-gray-800">Simple Mode</span>
          <span className="text-xs text-gray-400 mt-1">Uses the Business Details text box. Good for small descriptions.</span>
        </button>

        <button
          onClick={() => handleSwitch('rag')}
          disabled={switching}
          className={`relative flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${mode === 'rag' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'} ${switching ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {mode === 'rag' && <span className="absolute top-3 right-3 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span>}
          <span className="text-2xl mb-2">🧠</span>
          <span className="text-sm font-semibold text-gray-800">RAG Mode</span>
          <span className="text-xs text-gray-400 mt-1">Uses uploaded documents and smart search. Best for large knowledge bases.</span>
        </button>
      </div>

      {error && <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2"><span>⚠️</span>{error}</div>}

      <div className={`mt-4 p-3 rounded-lg text-xs ${mode === 'rag' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-gray-50 text-gray-500 border border-gray-100'}`}>
        {mode === 'rag' ? (
          <><strong>RAG active:</strong> Business Details field is disabled. The chatbot gets its knowledge from uploaded documents. System prompt still applies to every message.</>
        ) : (
          <><strong>Simple active:</strong> The chatbot uses whatever you type in Business Details. Upload documents anytime in Knowledge Base and switch to RAG when ready.</>
        )}
      </div>
    </div>
  );
}