import { useCallback, useEffect, useState } from 'react';
import type { ScheduledPost } from '../../shared/types';

export function CalendarPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(() => { setLoading(true); setError(''); chrome.runtime.sendMessage({ type: 'GET_SCHEDULED_POSTS' }, (response: ScheduledPost[] | { error?: string }) => {
    setLoading(false); if (Array.isArray(response)) setPosts(response); else setError(response?.error ?? 'Could not load reminders.');
  }); }, []);
  useEffect(load, [load]);
  const remove = (post: ScheduledPost) => { setError(''); chrome.runtime.sendMessage({ type: 'DELETE_SCHEDULED_POST', data: { id: post.id } }, (response: { success?: boolean; error?: string }) => {
    if (response?.success) setPosts((items) => items.filter((item) => item.id !== post.id)); else setError(response?.error ?? 'Could not delete reminder.');
  }); };
  return <section aria-labelledby="calendar-title" className="fade-in"><header className="mb-4"><h1 id="calendar-title" className="text-xl font-bold">Calendar</h1><p className="mt-1 text-xs text-gray-400">Local reminders. You remain in control of final sharing.</p></header>
    {error && <div role="alert" className="mb-3 rounded-lg border border-red-900 bg-red-950/50 p-3 text-xs text-red-200">{error}</div>}
    {loading ? <p className="py-10 text-center text-sm text-gray-500">Loading reminders…</p> : posts.length === 0 ? <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center"><p className="text-sm font-medium text-gray-300">Nothing scheduled</p><p className="mt-1 text-xs text-gray-500">Create a reminder from the Creator dock.</p></div> : <ul className="space-y-2">{posts.map((post) => <li key={post.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3"><div className="flex justify-between gap-3"><div><span className={`text-[10px] font-bold uppercase tracking-wider ${post.status === 'due' ? 'text-amber-400' : 'text-emerald-400'}`}>{post.status}</span><p className="mt-1 line-clamp-2 text-sm text-gray-200">{post.caption || `${post.type} reminder`}</p></div><button onClick={() => remove(post)} className="self-start rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-red-950 hover:text-red-300">Delete</button></div><time className="mt-3 block text-[11px] text-gray-500" dateTime={new Date(post.scheduledAt).toISOString()}>{new Date(post.scheduledAt).toLocaleString()}</time></li>)}</ul>}
  </section>;
}
