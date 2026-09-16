import { useEffect, useState, type ReactNode } from 'react';
import type { AuthState, SettingsState } from '../shared/types';
import { NavItem } from './components/NavItem';
import { AudiencePage } from './pages/AudiencePage';
import { CalendarPage } from './pages/CalendarPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { DraftsPage } from './pages/DraftsPage';
import { GhostPage } from './pages/GhostPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';

type Page = 'home' | 'downloads' | 'drafts' | 'calendar' | 'audience' | 'ghost' | 'settings';

const icons: Record<Page, ReactNode> = {
  home: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" />,
  downloads: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />,
  drafts: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3h9l3 3v15H6zM9 11h6M9 15h6" />,
  calendar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v3m12-3v3M4 8h16v12H4zM8 12h3v3H8z" />,
  audience: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8zm8 0a3 3 0 100-6m4 16v-2a4 4 0 00-3-3.87" />,
  ghost: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.4 10.4 0 0112 4c5 0 9 5 9 8a11 11 0 01-2.2 3.8M6.2 6.2C4.2 7.6 3 10 3 12c0 3 4 8 9 8 1.4 0 2.7-.4 3.8-1" />,
  settings: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm7.4-3.5a7.6 7.6 0 00-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 00-1.7-1L15 3.5h-4L10.6 6a8 8 0 00-1.7 1l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 000 2L4.5 14.5l2 3.4 2.4-1a8 8 0 001.7 1l.4 2.6h4l.4-2.6a8 8 0 001.7-1l2.4 1 2-3.4-2-1.5a7.6 7.6 0 00.1-1z" />,
};

const nav: Array<{ page: Page; label: string }> = [
  { page: 'home', label: 'Home' },
  { page: 'downloads', label: 'Downloads' },
  { page: 'drafts', label: 'Drafts' },
  { page: 'calendar', label: 'Calendar' },
  { page: 'audience', label: 'Audience' },
  { page: 'ghost', label: 'Ghost Mode' },
];

export default function App() {
  const [activePage, setActivePage] = useState<Page>('home');
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [settings, setSettings] = useState<SettingsState>({ adBlockEnabled: true, ghostModeEnabled: false, ghostModeAuto: false, theme: 'dark' });

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_AUTH' }, (response: AuthState) => {
      if (response?.isLoggedIn) setAuth(response);
      else setAuth(response ?? { isLoggedIn: false, userId: null, username: null, avatarUrl: null, csrfToken: null, appId: null, dtsgToken: null });
    });
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response: SettingsState) => {
      if (response) setSettings(response);
    });
  }, []);

  const updateSettings = (change: Partial<SettingsState>) => {
    setSettings((current) => ({ ...current, ...change }));
    chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', data: change });
  };
  const setGhostMode = (enabled: boolean) => {
    chrome.runtime.sendMessage({ type: 'SET_GHOST', data: { enabled } });
    updateSettings({ ghostModeEnabled: enabled });
  };

  if (!auth) return <div className="grid h-full place-items-center bg-gray-950" aria-label="Loading"><div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-700 border-t-pink-500" /></div>;
  if (!auth.isLoggedIn || !auth.userId) return (
    <div className="flex h-full flex-col items-center justify-center bg-gray-950 p-8 text-center text-white">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-xl border border-gray-700 bg-gray-900 text-lg font-bold">IM</div>
      <h1 className="text-xl font-bold">Connect Instagram</h1>
      <p className="mt-2 text-sm leading-5 text-gray-400">Sign in to Instagram in this browser, then reopen InstaManager.</p>
      <button onClick={() => chrome.tabs.create({ url: 'https://www.instagram.com/' })} className="mt-6 w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold text-gray-950">Open Instagram</button>
    </div>
  );

  const user = { username: auth.username ?? 'Instagram user', avatarUrl: auth.avatarUrl ?? '' };
  return (
    <div className="flex h-full w-full overflow-hidden bg-gray-950 text-white">
      <nav aria-label="InstaManager sections" className="flex w-[68px] flex-shrink-0 flex-col items-center border-r border-gray-800 bg-gray-950 py-3">
        <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-white text-sm font-black text-gray-950">IM</div>
        <div className="custom-scrollbar flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto px-2">
          {nav.map(({ page, label }) => <NavItem key={page} label={label} isActive={activePage === page} onClick={() => setActivePage(page)} icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icons[page]}</svg>} />)}
        </div>
        <div className="w-full px-2 pt-1"><NavItem label="Settings" isActive={activePage === 'settings'} onClick={() => setActivePage('settings')} icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icons.settings}</svg>} /></div>
      </nav>
      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto p-4">
        {activePage === 'home' && <HomePage user={user} ghostMode={settings.ghostModeEnabled} adBlocker={settings.adBlockEnabled} setGhostMode={setGhostMode} />}
        {activePage === 'downloads' && <DownloadsPage />}
        {activePage === 'drafts' && <DraftsPage accountId={auth.userId} />}
        {activePage === 'calendar' && <CalendarPage />}
        {activePage === 'audience' && <AudiencePage />}
        {activePage === 'ghost' && <GhostPage ghostMode={settings.ghostModeEnabled} setGhostMode={setGhostMode} />}
        {activePage === 'settings' && <SettingsPage adBlocker={settings.adBlockEnabled} setAdBlocker={(value) => updateSettings({ adBlockEnabled: value })} ghostModeAuto={settings.ghostModeAuto} setGhostModeAuto={(value) => updateSettings({ ghostModeAuto: value })} />}
      </main>
    </div>
  );
}

