import React from 'react';
import { Toggle } from '../components/Toggle';

interface GhostPageProps {
  ghostMode: boolean;
  setGhostMode: (val: boolean) => void;
}

export const GhostPage: React.FC<GhostPageProps> = ({ ghostMode, setGhostMode }) => {
  return (
    <div className="flex flex-col h-full fade-in">
      <div className="flex-1 flex flex-col items-center pt-8 px-4">
        <div className={`relative mb-8 transition-all duration-500 ${ghostMode ? 'scale-110 drop-shadow-[0_0_15px_rgba(129,52,175,0.5)]' : 'scale-100 opacity-50 grayscale'}`}>
          <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center border-4 border-gray-800 relative z-10">
            <svg className={`w-12 h-12 ${ghostMode ? 'text-[#8134af]' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
          </div>
          {ghostMode && (
            <div className="absolute inset-0 bg-gradient-to-r from-[#dd2a7b] to-[#8134af] rounded-full blur-xl opacity-30 animate-pulse -z-10" />
          )}
        </div>

        <h2 className="text-2xl font-bold text-white mb-2 text-center">Ghost Mode</h2>
        <p className="text-gray-400 text-sm text-center mb-8 max-w-[240px]">
          Browse stories and DMs silently. They won't know you've seen them.
        </p>

        <div className="w-full bg-gray-900/80 rounded-2xl border border-gray-800 p-1 mb-8 backdrop-blur-sm">
          <div className="p-4 bg-gray-900 rounded-xl">
            <Toggle 
              checked={ghostMode} 
              onChange={setGhostMode}
              label="Enable Ghost Mode"
            />
          </div>
        </div>

        <div className="w-full grid grid-cols-2 gap-3">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold text-gray-200 mb-1">0</div>
            <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">DMs Hidden</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold text-gray-200 mb-1">0</div>
            <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Stories Hidden</div>
          </div>
        </div>
      </div>
    </div>
  );
};
