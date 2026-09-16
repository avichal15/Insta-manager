import { useState, useEffect } from 'react';
import { HomePage } from './pages/HomePage';
import { DownloadsPage } from './pages/DownloadsPage';
import { GhostPage } from './pages/GhostPage';
import { SettingsPage } from './pages/SettingsPage';
import { NavItem } from './components/NavItem';

type Page = 'home' | 'downloads' | 'ghost' | 'settings';

export default function App() {
  const [activePage, setActivePage] = useState<Page>('home');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [user, setUser] = useState<{ username: string; avatarUrl: string } | null>(null);
  
  const [ghostMode, setGhostMode] = useState(false);
  const [adBlocker, setAdBlocker] = useState(true);
  const [ghostModeAuto, setGhostModeAuto] = useState(false);

  useEffect(() => {
    // Check auth status
    chrome.runtime.sendMessage({ type: 'GET_AUTH' }, (response) => {
      if (response && response.isLoggedIn) {
        setIsLoggedIn(true);
        setUser(response.user || { username: 'Instagram User', avatarUrl: '' });
      } else {
        setIsLoggedIn(false);
      }
    });

    // Get settings
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
      if (settings) {
        setGhostMode(!!settings.ghostModeEnabled);
        setAdBlocker(settings.adBlockEnabled !== false);
        setGhostModeAuto(!!settings.ghostModeAuto);
      }
    });
  }, []);

  const handleSetGhostMode = (val: boolean) => {
    setGhostMode(val);
    chrome.runtime.sendMessage({ type: 'SET_GHOST', data: { enabled: val } });
    saveSettings({ ghostModeEnabled: val });
  };

  const handleSetAdBlocker = (val: boolean) => {
    setAdBlocker(val);
    saveSettings({ adBlockEnabled: val });
  };

  const handleSetGhostModeAuto = (val: boolean) => {
    setGhostModeAuto(val);
    saveSettings({ ghostModeAuto: val });
  };

  const saveSettings = (newSettings: any) => {
    chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', data: newSettings });
  };

  if (isLoggedIn === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-4 border-[#dd2a7b] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isLoggedIn === false) {
    return (
      <div className="flex flex-col h-full w-full items-center justify-center bg-gray-950 p-6 text-center">
        <div className="w-20 h-20 bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af] rounded-2xl flex items-center justify-center shadow-lg mb-6 shadow-[#dd2a7b]/20">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Not Logged In</h1>
        <p className="text-gray-400 text-sm mb-8">Please log in to Instagram in your browser to use InstaManager.</p>
        <button 
          onClick={() => chrome.tabs.create({ url: 'https://www.instagram.com/' })}
          className="px-6 py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors w-full shadow-md"
        >
          Open Instagram
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-gray-950 text-white overflow-hidden selection:bg-[#dd2a7b]/30">
      {/* Sidebar Navigation */}
      <nav className="w-16 bg-gray-950 border-r border-gray-800 flex flex-col items-center py-4 flex-shrink-0 z-20">
        <div className="w-10 h-10 bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af] rounded-xl flex items-center justify-center shadow-lg mb-8">
          <span className="text-white font-bold text-sm">IM</span>
        </div>
        
        <div className="flex-1 w-full px-2 flex flex-col gap-1">
          <NavItem 
            label="Home"
            isActive={activePage === 'home'} 
            onClick={() => setActivePage('home')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>} 
          />
          <NavItem 
            label="Downloads"
            isActive={activePage === 'downloads'} 
            onClick={() => setActivePage('downloads')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>} 
          />
          <NavItem 
            label="Ghost Mode"
            isActive={activePage === 'ghost'} 
            onClick={() => setActivePage('ghost')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>} 
          />
        </div>

        <div className="w-full px-2 mt-auto">
          <NavItem 
            label="Settings"
            isActive={activePage === 'settings'} 
            onClick={() => setActivePage('settings')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM12 15a3 3 0 100-6 3 3 0 000 6z" /></svg>} 
          />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 bg-gray-950 p-4 overflow-y-auto relative z-10 custom-scrollbar">
        {activePage === 'home' && (
          <HomePage 
            user={user} 
            ghostMode={ghostMode} 
            adBlocker={adBlocker}
            setGhostMode={handleSetGhostMode} 
          />
        )}
        {activePage === 'downloads' && <DownloadsPage />}
        {activePage === 'ghost' && (
          <GhostPage 
            ghostMode={ghostMode} 
            setGhostMode={handleSetGhostMode} 
          />
        )}
        {activePage === 'settings' && (
          <SettingsPage 
            adBlocker={adBlocker}
            setAdBlocker={handleSetAdBlocker}
            ghostModeAuto={ghostModeAuto}
            setGhostModeAuto={handleSetGhostModeAuto}
          />
        )}
      </main>
    </div>
  );
}
