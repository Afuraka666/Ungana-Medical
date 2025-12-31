
import React from 'react';

interface HeaderProps {
  supportedLanguages: Record<string, string>;
  currentLanguage: string;
  onLanguageChange: (langCode: string) => void;
  currentTheme: string;
  onThemeToggle: () => void;
  T: Record<string, any>;
  className?: string;
}

const logoDataUri = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%231e3a8a'/><g stroke='white' stroke-width='4' stroke-linecap='round'><line x1='50' y1='50' x2='50' y2='20'/><line x1='50' y1='50' x2='71.21' y2='28.79'/><line x1='50' y1='50' x2='80' y2='50'/><line x1='50' y1='50' x2='71.21' y2='71.21'/><line x1='50' y1='50' x2='50' y2='80'/><line x1='50' y1='50' x2='28.79' y2='71.21'/><line x1='50' y1='50' x2='20' y2='50'/><line x1='50' y1='50' x2='28.79' y2='28.79'/></g><g fill='%233b82f6' stroke='white' stroke-width='2.5'><circle cx='50' cy='20' r='8'/><circle cx='71.21' cy='28.79' r='8'/><circle cx='80' cy='50' r='8'/><circle cx='71.21' cy='71.21' r='8'/><circle cx='50' cy='80' r='8'/><circle cx='28.79' cy='71.21' r='8'/><circle cx='20' cy='50' r='8'/><circle cx='28.79' cy='28.79' r='8'/></g><circle cx='50' cy='50' r='16' fill='white'/><line x1='42' y1='50' x2='58' y2='50' stroke='%231e3a8a' stroke-width='5' stroke-linecap='round'/><line x1='50' y1='42' x2='50' y2='58' stroke='%231e3a8a' stroke-width='5' stroke-linecap='round'/></svg>";

export const Header: React.FC<HeaderProps> = ({ supportedLanguages, currentLanguage, onLanguageChange, currentTheme, onThemeToggle, T, className }) => {
  return (
    <header className={`bg-brand-blue dark:bg-slate-900 shadow-md text-white transition-colors duration-300 ${className || ''}`}>
      <div className="container mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img src={logoDataUri} alt="Ungana Medical Logo" className="w-8 h-8 sm:w-10 sm:h-10" />
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Ungana Medical</h1>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-4">
          <p className="text-sm text-blue-200 hidden lg:block">{T.headerSubtitle}</p>
          
          <button 
            onClick={onThemeToggle}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title={currentTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {currentTheme === 'light' ? (
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
               </svg>
            ) : (
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
               </svg>
            )}
          </button>

          <div className="relative">
            <select
              value={currentLanguage}
              onChange={(e) => onLanguageChange(e.target.value)}
              aria-label="Select language"
              className="bg-brand-blue-light/50 dark:bg-slate-700 text-white text-xs sm:text-sm rounded-md pl-2 pr-7 py-1.5 border border-transparent hover:bg-brand-blue-light/75 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-white/50 transition appearance-none"
            >
              {Object.entries(supportedLanguages).map(([code, name]) => (
                <option key={code} value={code} className="bg-brand-blue dark:bg-slate-800 text-white">{name}</option>
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
