import React from 'react';
import { StatusBadge } from '../components/StatusBadge';

interface HomePageProps {
  user: { username: string; avatarUrl: string } | null;
  ghostMode: boolean;
  adBlocker: boolean;
  setGhostMode: (val: boolean) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ user, ghostMode, adBlocker, setGhostMode }) => {
  const handleOpenInstagram = () => {
    chrome.tabs.create({ url: 'https://www.instagram.com/' });
  };

  const handleDownloadCurrent = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_MEDIA' });
      }
    });
  };

  return (
    <div className="flex flex-col h-full space-y-4 fade-in p-1">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-5 rounded-2xl border border-gray-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#dd2a7b]/20 to-transparent rounded-bl-full opacity-50" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af]">
            <div className="w-full h-full bg-gray-900 rounded-full flex items-center justify-center overflow-hidden border-2 border-gray-900">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              )}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">{user?.username || 'Guest User'}</h2>
            <p className="text-xs text-gray-400 font-medium">Ready to browse</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/80 p-4 rounded-xl border border-gray-800 flex flex-col justify-between hover:border-gray-700 transition-colors backdrop-blur-sm">
          <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Ghost Mode</div>
          <div>
            <StatusBadge isOn={ghostMode} />
          </div>
        </div>
        <div className="bg-gray-900/80 p-4 rounded-xl border border-gray-800 flex flex-col justify-between hover:border-gray-700 transition-colors backdrop-blur-sm">
          <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Ad Blocker</div>
          <div>
            <StatusBadge isOn={adBlocker} />
          </div>
        </div>
      </div>

      <div className="bg-gray-900/60 rounded-xl border border-gray-800 p-4 flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Quick Actions</h3>
        
        <button 
          onClick={() => setGhostMode(!ghostMode)}
          className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 transition-all group"
        >
          <div className="flex items-center gap-3">
            <svg className={`w-5 h-5 ${ghostMode ? 'text-[#8134af]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            <span className="text-sm font-medium text-gray-200 group-hover:text-white">Toggle Ghost Mode</span>
          </div>
        </button>

        <button 
          onClick={handleDownloadCurrent}
          className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 transition-all group"
        >
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400 group-hover:text-[#dd2a7b]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            <span className="text-sm font-medium text-gray-200 group-hover:text-white">Download Page Media</span>
          </div>
        </button>
        
        <button 
          onClick={handleOpenInstagram}
          className="flex items-center justify-center gap-2 p-3 mt-1 rounded-lg bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white font-medium hover:opacity-90 transition-opacity shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          Open Instagram
        </button>
      </div>
    </div>
  );
};
