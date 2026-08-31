const PDF_DB_NAME = 'paperai-pdf-store';
const PDF_DB_VERSION = 1;
const PDF_STORE_NAME = 'pdfs';

function openPdfDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PDF_DB_NAME, PDF_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PDF_STORE_NAME)) {
        db.createObjectStore(PDF_STORE_NAME);
      }
    };
  });
}

async function savePdfToStore(paperId, file) {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(PDF_STORE_NAME).put(file, paperId);
  });
}

async function getPdfFromStore(paperId) {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE_NAME, 'readonly');
    const req = tx.objectStore(PDF_STORE_NAME).get(paperId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePdfFromStore(paperId) {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(PDF_STORE_NAME).delete(paperId);
  });
}

async function clearPdfStore() {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(PDF_STORE_NAME).clear();
  });
}

function resolveAssetPath(relativePath) {
  if (!relativePath || relativePath.startsWith('http') || relativePath.startsWith('blob:')) {
    return relativePath;
  }
  const base = window.location.pathname.replace(/[^/]*$/, '');
  return `${base}${relativePath.replace(/^\//, '')}`;
}

async function checkRemotePdfExists(url) {
  try {
    let res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return true;
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url);
      return res.ok;
    }
    return false;
  } catch {
    return false;
  }
}

window.PdfStore = {
  savePdfToStore,
  getPdfFromStore,
  deletePdfFromStore,
  clearPdfStore,
  resolveAssetPath,
  checkRemotePdfExists,
};
