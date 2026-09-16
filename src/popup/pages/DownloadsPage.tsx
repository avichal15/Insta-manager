import React, { useState } from 'react';

export const DownloadsPage: React.FC = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<null | { type: string, id: string }>(null);

  const handleParse = () => {
    if (!url) return;
    setLoading(true);
    const match = url.match(/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/([^\/?#&]+)/i);
    setPreview(match ? { type: url.includes('/reel/') ? 'Reel' : 'Post', id: match[1] } : null);
    setLoading(false);
  };

  const handleDownload = () => {
    if (!url) return;
    chrome.tabs.create({ url });
  };

  const handleDownloadCurrent = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_MEDIA' });
      }
    });
  };

  return (
    <div className="flex flex-col h-full fade-in pb-4">
      <h2 className="text-xl font-bold text-white mb-4 tracking-tight px-1">Media Downloader</h2>
      
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4 shadow-sm">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Instagram URL</label>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Paste post or reel URL..." 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#dd2a7b] focus:ring-1 focus:ring-[#dd2a7b] transition-all"
          />
          <button 
            onClick={handleParse}
            disabled={!url || loading}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg border border-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : 'Parse'}
          </button>
        </div>

        {preview && (
          <div className="mt-4 p-3 bg-gray-950 rounded-lg border border-gray-800 flex items-center gap-4 animate-in slide-in-from-top-2">
            <div className="w-16 h-16 bg-gradient-to-br from-gray-800 to-gray-900 rounded-md border border-gray-700 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-200">{preview.type} Media</div>
              <div className="text-xs text-gray-500 mt-0.5">ID: {preview.id}</div>
            </div>
            <button 
              onClick={handleDownload}
              className="px-3 py-1.5 bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white text-xs font-bold rounded-md hover:opacity-90 shadow-lg"
            >
              Open
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 p-4 flex flex-col min-h-0">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Downloads</h3>
          <button onClick={handleDownloadCurrent} className="text-xs text-[#dd2a7b] hover:text-[#f58529] font-medium transition-colors">
            Extract from page
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar flex flex-col justify-center items-center opacity-50">
           <svg className="w-8 h-8 text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
           <span className="text-sm text-gray-500">No recent downloads</span>
        </div>
      </div>
    </div>
  );
};
