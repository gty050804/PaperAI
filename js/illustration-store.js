const ILLUSTRATION_DB_NAME = 'paperai-illustration-store';
const ILLUSTRATION_DB_VERSION = 1;
const ILLUSTRATION_STORE_NAME = 'images';

function openIllustrationDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ILLUSTRATION_DB_NAME, ILLUSTRATION_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ILLUSTRATION_STORE_NAME)) {
        db.createObjectStore(ILLUSTRATION_STORE_NAME);
      }
    };
  });
}

async function saveIllustrationToStore(key, blob) {
  const db = await openIllustrationDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ILLUSTRATION_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(ILLUSTRATION_STORE_NAME).put(blob, key);
  });
}

async function getIllustrationFromStore(key) {
  const db = await openIllustrationDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ILLUSTRATION_STORE_NAME, 'readonly');
    const req = tx.objectStore(ILLUSTRATION_STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteIllustrationFromStore(key) {
  const db = await openIllustrationDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ILLUSTRATION_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(ILLUSTRATION_STORE_NAME).delete(key);
  });
}

async function clearIllustrationStore() {
  const db = await openIllustrationDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ILLUSTRATION_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(ILLUSTRATION_STORE_NAME).clear();
  });
}

window.IllustrationStore = {
  saveIllustrationToStore,
  getIllustrationFromStore,
  deleteIllustrationFromStore,
  clearIllustrationStore,
};
