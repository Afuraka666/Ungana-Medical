
import React from 'react';

interface HeaderProps {
  supportedLanguages: Record<string, string>;
  currentLanguage: string;
  onLanguageChange: (langCode: string) => void;
  T: Record<string, any>;
}

export const Header: React.FC<HeaderProps> = ({ supportedLanguages, currentLanguage, onLanguageChange, T }) => {
  return (
    <header className="bg-brand-blue shadow-md text-white">
      <div className="container mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img src="/icon.svg" alt="Synapsis Medical Logo" className="w-8 h-8 sm:w-10 sm:h-10" />
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Synapsis <span className="hidden sm:inline">Medical</span></h1>
        </div>
        <div className="flex items-center space-x-4">
          <p className="text-sm text-blue-200 hidden md:block">{T.headerSubtitle}</p>
          <div className="relative">
            <select
              value={currentLanguage}
              onChange={(e) => onLanguageChange(e.target.value)}
              aria-label="Select language"
              className="bg-brand-blue-light/50 text-white text-xs sm:text-sm rounded-md pl-2 pr-7 py-1.5 border border-transparent hover:bg-brand-blue-light/75 focus:outline-none focus:ring-2 focus:ring-white/50 transition appearance-none"
            >
              {Object.entries(supportedLanguages).map(([code, name]) => (
                <option key={code} value={code} className="bg-brand-blue text-white">{name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
