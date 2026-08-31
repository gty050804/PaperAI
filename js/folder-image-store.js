const FOLDER_IMG_DB_NAME = 'paperai-folder-image-store';
const FOLDER_IMG_DB_VERSION = 1;
const FOLDER_IMG_STORE_NAME = 'images';

function openFolderImageDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FOLDER_IMG_DB_NAME, FOLDER_IMG_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(FOLDER_IMG_STORE_NAME)) {
        db.createObjectStore(FOLDER_IMG_STORE_NAME);
      }
    };
  });
}

async function saveFolderImageToStore(folderId, blob) {
  const db = await openFolderImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_IMG_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(FOLDER_IMG_STORE_NAME).put(blob, folderId);
  });
}

async function getFolderImageFromStore(folderId) {
  const db = await openFolderImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_IMG_STORE_NAME, 'readonly');
    const req = tx.objectStore(FOLDER_IMG_STORE_NAME).get(folderId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFolderImageFromStore(folderId) {
  const db = await openFolderImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_IMG_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(FOLDER_IMG_STORE_NAME).delete(folderId);
  });
}

async function clearFolderImageStore() {
  const db = await openFolderImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_IMG_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(FOLDER_IMG_STORE_NAME).clear();
  });
}

window.FolderImageStore = {
  saveFolderImageToStore,
  getFolderImageFromStore,
  deleteFolderImageFromStore,
  clearFolderImageStore,
};
