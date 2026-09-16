import { Toggle } from '../components/Toggle';

interface GhostPageProps { ghostMode: boolean; setGhostMode: (value: boolean) => void }
export function GhostPage({ ghostMode, setGhostMode }: GhostPageProps) {
  return <section aria-labelledby="privacy-title" className="fade-in"><header className="mb-5"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-400">Privacy controls</p><h1 id="privacy-title" className="mt-1 text-xl font-bold">Ghost Mode</h1><p className="mt-1 text-xs leading-5 text-gray-400">Reduces selected seen-status requests while you browse Instagram.</p></header>
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4"><Toggle checked={ghostMode} onChange={setGhostMode} label="Enable Ghost Mode" description="Applies privacy request blocking to supported Instagram views." /></div>
    <div className="mt-4 space-y-2"><div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3"><h2 className="text-sm font-semibold text-gray-200">What it does</h2><p className="mt-1 text-xs leading-5 text-gray-400">Blocks supported story and direct-message seen receipts before they leave the page.</p></div><div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3"><h2 className="text-sm font-semibold text-amber-200">Important limitation</h2><p className="mt-1 text-xs leading-5 text-amber-200/80">Instagram changes frequently. This control cannot guarantee anonymity; verify behavior after extension and site updates.</p></div></div>
  </section>;
}
