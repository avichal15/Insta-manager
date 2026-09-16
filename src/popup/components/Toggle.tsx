import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, description }) => {
  return (
    <div className="flex items-center justify-between py-3">
      {(label || description) && (
        <div className="flex flex-col mr-4">
          {label && <span className="text-sm font-medium text-gray-200">{label}</span>}
          {description && <span className="text-xs text-gray-400 mt-1">{description}</span>}
        </div>
      )}
      <button
        type="button"
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#dd2a7b] focus:ring-offset-2 focus:ring-offset-gray-900 ${
          checked ? 'bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af]' : 'bg-gray-700'
        }`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
