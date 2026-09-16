import type { PublishFormat } from './types';

export const MAX_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_ACCOUNT_BYTES = 750 * 1024 * 1024;

export interface DraftRecord { id: string; type: PublishFormat; caption: string; createdAt: number; updatedAt: number }
export interface DraftMediaInput { id: string; name: string; type: string; size: number; blob: Blob }
export interface StoredDraft extends DraftRecord { accountId: string; media: DraftMediaInput[] }
type DraftRow = DraftRecord & { key: string; accountId: string };
type MediaRow = DraftMediaInput & { key: string; accountId: string; draftId: string; position: number };

const DATABASE = 'insta-manager-drafts', VERSION = 1, DRAFTS = 'drafts', MEDIA = 'media';
const key = (accountId: string, id: string) => `${accountId}:${id}`;
function request<T>(value: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? new Error('IndexedDB request failed.')); }); }
function transactionDone(value: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { value.oncomplete = () => resolve(); value.onabort = () => reject(value.error ?? new Error('Draft transaction was cancelled.')); value.onerror = () => reject(value.error ?? new Error('Draft transaction failed.')); }); }
function openDatabase(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const pending = indexedDB.open(DATABASE, VERSION); pending.onupgradeneeded = () => { const database = pending.result; const drafts = database.createObjectStore(DRAFTS, { keyPath: 'key' }); drafts.createIndex('accountId', 'accountId'); const media = database.createObjectStore(MEDIA, { keyPath: 'key' }); media.createIndex('accountId', 'accountId'); media.createIndex('draftKey', ['accountId', 'draftId']); }; pending.onsuccess = () => resolve(pending.result); pending.onerror = () => reject(pending.error ?? new Error('Could not open draft storage.')); }); }
function validate(accountId: string, draft: DraftRecord, media: DraftMediaInput[]): void { if (!accountId.trim() || !draft.id.trim()) throw new Error('Draft account and id are required.'); if (media.length > 20) throw new Error('A draft can contain no more than 20 media files.'); if (media.some((item) => item.size > MAX_FILE_BYTES || item.blob.size > MAX_FILE_BYTES)) throw new Error('Each draft file must be 250 MB or smaller.'); const total = media.reduce((sum, item) => sum + Math.max(item.size, item.blob.size), 0); if (total > MAX_ACCOUNT_BYTES) throw new Error('Draft media exceeds the 750 MB account limit.'); }
async function rowsForIndex<T>(store: IDBObjectStore, index: string, value: IDBValidKey): Promise<T[]> { return request(store.index(index).getAll(value)) as Promise<T[]>; }

export async function saveDraft(accountId: string, draft: DraftRecord, media: DraftMediaInput[]): Promise<void> {
  validate(accountId, draft, media); const database = await openDatabase();
  try { const transaction = database.transaction([DRAFTS, MEDIA], 'readwrite'); const drafts = transaction.objectStore(DRAFTS); const mediaStore = transaction.objectStore(MEDIA); const current = await rowsForIndex<MediaRow>(mediaStore, 'accountId', accountId); const otherBytes = current.filter((item) => item.draftId !== draft.id).reduce((sum, item) => sum + item.size, 0); const nextBytes = media.reduce((sum, item) => sum + Math.max(item.size, item.blob.size), 0); if (otherBytes + nextBytes > MAX_ACCOUNT_BYTES) { transaction.abort(); throw new Error('Draft media exceeds the 750 MB account limit.'); } current.filter((item) => item.draftId === draft.id).forEach((item) => mediaStore.delete(item.key)); drafts.put({ ...draft, key: key(accountId, draft.id), accountId } satisfies DraftRow); media.forEach((item, position) => mediaStore.put({ ...item, key: key(accountId, `${draft.id}:${item.id}`), accountId, draftId: draft.id, position } satisfies MediaRow)); await transactionDone(transaction); } finally { database.close(); }
}

export async function getDraft(accountId: string, draftId: string): Promise<StoredDraft | null> {
  const database = await openDatabase();
  try { const transaction = database.transaction([DRAFTS, MEDIA], 'readonly'); const row = await request(transaction.objectStore(DRAFTS).get(key(accountId, draftId))) as DraftRow | undefined; if (!row || row.accountId !== accountId) return null; const media = (await rowsForIndex<MediaRow>(transaction.objectStore(MEDIA), 'draftKey', [accountId, draftId])).sort((a, b) => a.position - b.position).map(({ id, name, type, size, blob }) => ({ id, name, type, size, blob })); return { id: row.id, accountId, type: row.type, caption: row.caption, createdAt: row.createdAt, updatedAt: row.updatedAt, media }; } finally { database.close(); }
}

export async function listDrafts(accountId: string): Promise<StoredDraft[]> { const database = await openDatabase(); try { const rows = await rowsForIndex<DraftRow>(database.transaction(DRAFTS, 'readonly').objectStore(DRAFTS), 'accountId', accountId); return (await Promise.all(rows.map((row) => getDraft(accountId, row.id)))).filter((draft): draft is StoredDraft => draft !== null).sort((a, b) => b.updatedAt - a.updatedAt); } finally { database.close(); } }
export async function deleteDraft(accountId: string, draftId: string): Promise<void> { const database = await openDatabase(); try { const transaction = database.transaction([DRAFTS, MEDIA], 'readwrite'); transaction.objectStore(DRAFTS).delete(key(accountId, draftId)); const store = transaction.objectStore(MEDIA); const media = await rowsForIndex<MediaRow>(store, 'draftKey', [accountId, draftId]); media.forEach((item) => store.delete(item.key)); await transactionDone(transaction); } finally { database.close(); } }
export async function cleanupDrafts(accountId: string, retainedIds: string[]): Promise<void> { const retained = new Set(retainedIds), database = await openDatabase(); try { const transaction = database.transaction([DRAFTS, MEDIA], 'readwrite'), drafts = transaction.objectStore(DRAFTS), media = transaction.objectStore(MEDIA); const draftRows = await rowsForIndex<DraftRow>(drafts, 'accountId', accountId), mediaRows = await rowsForIndex<MediaRow>(media, 'accountId', accountId); draftRows.filter((row) => !retained.has(row.id)).forEach((row) => drafts.delete(row.key)); mediaRows.filter((row) => !retained.has(row.draftId)).forEach((row) => media.delete(row.key)); await transactionDone(transaction); } finally { database.close(); } }

Object.assign(globalThis, { InstaManagerDrafts: { MAX_FILE_BYTES, MAX_ACCOUNT_BYTES, saveDraft, getDraft, listDrafts, deleteDraft, cleanupDrafts } });
