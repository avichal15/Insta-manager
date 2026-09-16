import React from 'react';

interface StatusBadgeProps {
  isOn: boolean;
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ isOn, label }) => {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-sm backdrop-blur-sm ${
      isOn 
        ? 'bg-green-500/10 text-green-400 border-green-500/20' 
        : 'bg-gray-800/50 text-gray-400 border-gray-700'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isOn ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
      {label || (isOn ? 'ON' : 'OFF')}
    </div>
  );
};
