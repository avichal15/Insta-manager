import { useEffect, useState } from 'react';
import type { AudienceSnapshot } from '../../shared/types';

export function AudiencePage() {
  const [snapshot, setSnapshot] = useState<AudienceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { chrome.runtime.sendMessage({ type: 'GET_AUDIENCE_SNAPSHOT' }, (response: AudienceSnapshot | { error?: string } | null) => { setLoading(false); if (response && 'scannedAt' in response) setSnapshot(response); else if (response && 'error' in response) setError(response.error ?? 'Could not load audience.'); }); }, []);
  const scan = () => { setScanning(true); setError(''); chrome.runtime.sendMessage({ type: 'SCAN_AUDIENCE' }, (response: { success?: boolean; snapshot?: AudienceSnapshot; error?: string }) => { setScanning(false); if (response?.success && response.snapshot) setSnapshot(response.snapshot); else setError(response?.error ?? 'Audience scan failed.'); }); };
  return <section aria-labelledby="audience-title" className="fade-in"><header className="mb-4 flex items-start justify-between gap-3"><div><h1 id="audience-title" className="text-xl font-bold">Audience</h1><p className="mt-1 text-xs text-gray-400">Account-bound relationship insights.</p></div><button type="button" onClick={scan} disabled={scanning} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-950 disabled:opacity-50">{scanning ? 'Scanning…' : snapshot ? 'Refresh' : 'Scan'}</button></header>
    {error && <div role="alert" className="mb-3 rounded-lg border border-red-900 bg-red-950/50 p-3 text-xs text-red-200">{error}</div>}
    {loading ? <p className="py-10 text-center text-sm text-gray-500">Loading audience…</p> : !snapshot ? <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center"><p className="text-sm font-medium text-gray-300">No audience snapshot</p><p className="mt-1 text-xs text-gray-500">Run a scan to compare followers and following.</p></div> : <><div className="grid grid-cols-2 gap-2">{[['Followers', snapshot.followerCount], ['Following', snapshot.followingCount], ['Not following back', snapshot.nonFollowers.length], ['Suspicious', snapshot.suspiciousFollowers.length]].map(([label, value]) => <div key={label} className="rounded-lg border border-gray-800 bg-gray-900 p-3"><div className="text-lg font-bold">{value}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-gray-500">{label}</div></div>)}</div><p className="mt-3 text-[11px] text-gray-500">Scanned {snapshot.scannedFollowers} followers and {snapshot.scannedFollowing} following on {new Date(snapshot.scannedAt).toLocaleString()}.{snapshot.limited ? ' Instagram limited this snapshot.' : ''}</p></>}
    <div className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-[11px] leading-4 text-amber-200">Audience actions use private Instagram interfaces and may stop working. Review accounts individually before taking action.</div>
  </section>;
}
