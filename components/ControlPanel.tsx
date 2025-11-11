import React, { useState, useEffect, useRef } from 'react';

interface ControlPanelProps {
  onGenerate: (condition: string, discipline: string, difficulty: string) => void;
  disabled: boolean;
  T: Record<string, any>;
  onSaveCase: () => void;
  onOpenSavedWork: () => void;
  onOpenClinicalTools: () => void;
  isCaseActive: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ onGenerate, disabled, T, onSaveCase, onOpenSavedWork, onOpenClinicalTools, isCaseActive }) => {
  const [conditionInput, setConditionInput] = useState("Type 2 Diabetes Mellitus");
  const [disciplineInput, setDisciplineInput] = useState("Medicine");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [history, setHistory] = useState<{ condition: string; discipline: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const storedHistory = JSON.parse(localStorage.getItem('generationHistory') || '[]');
      if (Array.isArray(storedHistory)) {
        setHistory(storedHistory);
      }
    } catch (e) {
      console.error("Failed to parse history from localStorage", e);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
            setShowHistory(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const condition = conditionInput.trim();
    const discipline = disciplineInput.trim();
    if (condition && discipline && !disabled) {
      onGenerate(condition, discipline, difficulty);
      
      setHistory(prevHistory => {
        const newEntry = { condition, discipline };
        const isDuplicate = prevHistory.some(
          item => item.condition.toLowerCase() === newEntry.condition.toLowerCase() && item.discipline.toLowerCase() === newEntry.discipline.toLowerCase()
        );
        if (isDuplicate) return prevHistory;

        const updatedHistory = [newEntry, ...prevHistory].slice(0, 15); // Keep last 15 unique entries
        localStorage.setItem('generationHistory', JSON.stringify(updatedHistory));
        return updatedHistory;
      });
    }
  };

  const handleSelectHistory = (item: { condition: string; discipline: string }) => {
    setConditionInput(item.condition);
    setDisciplineInput(item.discipline);
    setShowHistory(false);
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('generationHistory');
    setShowHistory(false);
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
        <div className="flex flex-col col-span-1 md:col-span-1 lg:col-span-4">
            <label htmlFor="condition-input" className="font-semibold text-gray-700 text-sm mb-1">
              {T.conditionLabel}
            </label>
            <input
              type="text"
              id="condition-input"
              value={conditionInput}
              onChange={(e) => setConditionInput(e.target.value)}
              disabled={disabled}
              placeholder={T.conditionPlaceholder}
              className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition w-full bg-gray-50 text-black"
            />
        </div>
        
        <div className="flex flex-col col-span-1 md:col-span-1 lg:col-span-4">
            <label htmlFor="discipline-input" className="font-semibold text-gray-700 text-sm mb-1">
              {T.disciplineLabel}
            </label>
            <input
              type="text"
              id="discipline-input"
              value={disciplineInput}
              onChange={(e) => setDisciplineInput(e.target.value)}
              disabled={disabled}
              placeholder={T.disciplinePlaceholder}
              className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition w-full bg-gray-50 text-black"
            />
        </div>
        
        <div className="flex flex-col col-span-1 md:col-span-1 lg:col-span-2">
          <label htmlFor="difficulty-select" className="font-semibold text-gray-700 text-sm mb-1">
            {T.difficultyLabel}
          </label>
          <div className="relative">
            <select
              id="difficulty-select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              disabled={disabled}
              className="appearance-none w-full bg-gray-50 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition h-[42px] pr-8 text-black"
            >
              <option value="beginner">{T.difficultyBeginner}</option>
              <option value="intermediate">{T.difficultyIntermediate}</option>
              <option value="advanced">{T.difficultyAdvanced}</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        <div className="col-span-1 md:col-span-1 lg:col-span-2 flex items-end space-x-2">
            <div className="relative" ref={historyRef}>
                <button
                  type="button"
                  onClick={() => setShowHistory(s => !s)}
                  disabled={disabled}
                  title={T.historyButtonTitle}
                  aria-label={T.historyButtonTitle}
                  className="h-[42px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold p-2 rounded-md transition duration-300 ease-in-out disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                </button>
                {showHistory && (
                    <div className="absolute bottom-full mb-2 right-0 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 z-20 max-h-80 overflow-y-auto animate-fade-in">
                        <div className="p-3 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                            <h4 className="font-semibold text-gray-800">{T.historyTitle}</h4>
                            {history.length > 0 && (
                                <button onClick={handleClearHistory} className="text-xs text-red-500 hover:text-red-700 font-medium">{T.clearHistoryButton}</button>
                            )}
                        </div>
                        {history.length === 0 ? (
                            <p className="p-4 text-sm text-gray-500 text-center">{T.noHistoryMessage}</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {history.map((item, index) => (
                                    <li key={index} onClick={() => handleSelectHistory(item)} className="p-3 hover:bg-gray-50 cursor-pointer transition">
                                        <p className="font-medium text-sm text-gray-800 truncate">{item.condition}</p>
                                        <p className="text-xs text-gray-500 truncate">{item.discipline}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
            <button
              type="submit"
              disabled={disabled || !conditionInput.trim() || !disciplineInput.trim()}
              className="flex-grow h-[42px] bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M12 6V3m0 18v-3"></path></svg>
              <span>{T.generateButton}</span>
            </button>
        </div>
      </form>
      <div className="border-t border-gray-200 mt-4 pt-3 flex items-center">
         <div className="flex items-center space-x-3">
            <button
              onClick={onSaveCase}
              disabled={disabled || !isCaseActive}
              title={!isCaseActive ? T.saveCaseDisabledTooltip : T.saveCaseButton}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v12a1 1 0 01-1.447.894L10 14.586l-3.553 2.308A1 1 0 015 16V4z" />
              </svg>
              <span>{T.saveCaseButton}</span>
            </button>
            <button
              onClick={onOpenSavedWork}
              disabled={disabled}
              title={T.savedWorkButton}
              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3zm3.146 4.146L8 9.586v4.172l.854-.854L13.854 8H4.146z" clipRule="evenodd" />
              </svg>
              <span>{T.savedWorkButton}</span>
            </button>
            <button
              onClick={onOpenClinicalTools}
              disabled={disabled}
              title={T.clinicalToolsButton}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-sm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              <span>{T.clinicalToolsButton}</span>
            </button>
        </div>
      </div>
    </div>
  );
};