import React from 'react';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export const NavItem: React.FC<NavItemProps> = ({ icon, label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center justify-center p-3 rounded-xl transition-all duration-200 group w-full mb-2 ${
        isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
      }`}
      title={label}
    >
      <div className={`relative z-10 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      {isActive && (
        <div className="absolute left-0 w-1 h-8 bg-gradient-to-b from-[#f58529] via-[#dd2a7b] to-[#8134af] rounded-r-full" />
      )}
    </button>
  );
};
