function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sponsorguess-authorized-audio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('clips');
    request.onerror = () => reject(Error('Local audio storage is unavailable.'));
    request.onsuccess = () => resolve(request.result);
  });
}
export async function storeAudio(id, file) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('clips', 'readwrite'); tx.objectStore('clips').put(file, id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(Error('Could not save this audio on your device.')); };
  });
}
export async function getAudio(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('clips').objectStore('clips').get(id);
    request.onsuccess = () => { db.close(); resolve(request.result ?? null); };
    request.onerror = () => { db.close(); reject(Error('Could not read the authorized audio file.')); };
  });
}
