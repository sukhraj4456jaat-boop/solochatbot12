import api from './api';

export const getKnowledgeBase = (chatbotId) =>
  api.get(`/knowledge/${chatbotId}`).then(r => r.data);

export const updateKBSettings = (chatbotId, settings) =>
  api.put(`/knowledge/${chatbotId}/settings`, settings).then(r => r.data);

export const getDocuments = (chatbotId) =>
  api.get(`/knowledge/${chatbotId}/documents`).then(r => r.data);

export const uploadDocument = (chatbotId, file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const token = localStorage.getItem('token');
    const xhr = new XMLHttpRequest();

    xhr.open('POST', `/api/knowledge/${chatbotId}/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || `Request failed (${xhr.status})`));
        }
      } catch (err) {
        reject(err);
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(formData);
  });
};

export const addUrl = (chatbotId, url) =>
  api.post(`/knowledge/${chatbotId}/url`, { url }).then(r => r.data);

export const addText = (chatbotId, title, content) =>
  api.post(`/knowledge/${chatbotId}/text`, { title, content }).then(r => r.data);

export const deleteDocument = (chatbotId, docId) =>
  api.delete(`/knowledge/${chatbotId}/documents/${docId}`).then(r => r.data);

export const reprocessDocument = (chatbotId, docId) =>
  api.post(`/knowledge/${chatbotId}/reprocess/${docId}`).then(r => r.data);

export const testSearch = (chatbotId, query, topK = 5) =>
  api.post(`/knowledge/${chatbotId}/search`, { query, topK }).then(r => r.data);

export const getEmbeddingConfig = (chatbotId) =>
  api.get(`/knowledge/${chatbotId}/embedding`).then(r => r.data);

export const saveEmbeddingConfig = (chatbotId, config) =>
  api.put(`/knowledge/${chatbotId}/embedding`, config).then(r => r.data);

export const testEmbeddingConnection = (chatbotId, config) =>
  api.post(`/knowledge/${chatbotId}/embedding/test`, config).then(r => r.data);

export const setKnowledgeMode = (chatbotId, mode) =>
  api.put(`/chatbots/${chatbotId}/knowledge-mode`, { mode }).then(r => r.data);