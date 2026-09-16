import { useCallback, useEffect, useState } from 'react';
import type { StoredDraft } from '../../shared/drafts';

type DraftApi = typeof import('../../shared/drafts');
const draftsApi = () => (globalThis as typeof globalThis & { InstaManagerDrafts: DraftApi }).InstaManagerDrafts;

export function DraftsPage({ accountId }: { accountId: string }) {
  const [drafts, setDrafts] = useState<StoredDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setDrafts(await draftsApi().listDrafts(accountId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load drafts.'); }
    finally { setLoading(false); }
  }, [accountId]);
  useEffect(() => { void load(); }, [load]);
  const remove = async (id: string) => {
    setError('');
    try { await draftsApi().deleteDraft(accountId, id); setDrafts((items) => items.filter((item) => item.id !== id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete draft.'); }
  };
  return <section aria-labelledby="drafts-title" className="fade-in">
    <header className="mb-4"><h1 id="drafts-title" className="text-xl font-bold">Drafts</h1><p className="mt-1 text-xs text-gray-400">Media and captions saved locally for this account.</p></header>
    {error && <div role="alert" className="mb-3 rounded-lg border border-red-900 bg-red-950/50 p-3 text-xs text-red-200">{error}</div>}
    {loading ? <p className="py-10 text-center text-sm text-gray-500">Loading drafts…</p> : drafts.length === 0 ? <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center"><p className="text-sm font-medium text-gray-300">No saved drafts</p><p className="mt-1 text-xs text-gray-500">Start one from the Creator dock on Instagram.</p></div> : <ul className="space-y-2">{drafts.map((draft) => <li key={draft.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="text-[10px] font-bold uppercase tracking-wider text-pink-400">{draft.type}</span><p className="mt-1 line-clamp-2 text-sm text-gray-200">{draft.caption || 'Untitled draft'}</p></div><button type="button" onClick={() => void remove(draft.id)} aria-label={`Delete ${draft.caption || 'draft'}`} className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-red-950 hover:text-red-300">Delete</button></div>
      <div className="mt-3 flex justify-between text-[11px] text-gray-500"><span>{draft.media.length} media file{draft.media.length === 1 ? '' : 's'}</span><time dateTime={new Date(draft.updatedAt).toISOString()}>{new Date(draft.updatedAt).toLocaleDateString()}</time></div>
    </li>)}</ul>}
  </section>;
}


