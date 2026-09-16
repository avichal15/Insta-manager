import type { ReactNode } from 'react';

interface NavItemProps { icon: ReactNode; label: string; isActive: boolean; onClick: () => void }

export function NavItem({ icon, label, isActive, onClick }: NavItemProps) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} aria-current={isActive ? 'page' : undefined} className={`group relative flex w-full items-center justify-center rounded-lg p-2.5 transition-colors ${isActive ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-900 hover:text-gray-200'}`}>
    {icon}
    {isActive && <span className="absolute left-0 h-5 w-0.5 rounded-r bg-pink-500" />}
  </button>;
}
