
import React, { useState, useEffect, useRef } from 'react';

interface ControlPanelProps {
  onGenerate: (condition: string, discipline: string, difficulty: string) => void;
  disabled: boolean;
  T: Record<string, any>;
  language: string;
  onSaveCase: () => void;
  onOpenSavedWork: () => void;
  onOpenClinicalTools: () => void;
  isCaseActive: boolean;
  onGenerateNew: () => void;
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

const MicButton: React.FC<{ onClick: () => void, isListening: boolean, disabled: boolean, title: string }> = ({ onClick, isListening, disabled, title }) => {
    return (
        <button 
            type="button" 
            onClick={onClick} 
            disabled={disabled} 
            title={title}
            className="absolute right-0 top-0 h-full px-2.5 flex items-center text-gray-400 hover:text-brand-blue-light disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
        >
            {isListening ? (
                 <svg className="h-5 w-5 text-red-500 animate-pulse" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 8a2 2 0 00-2 2v.001a2 2 0 002 2h4a2 2 0 002-2V10a2 2 0 00-2-2H8z" />
                </svg>
            ) : (
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm-1 4a4 4 0 108 0V4a4 4 0 10-8 0v4zM2 11a1 1 0 011-1h1a1 1 0 011 1v.5a.5.5 0 001 0V11a3 3 0 013-3h0a3 3 0 013 3v.5a.5.5 0 001 0V11a1 1 0 011 1h1a1 1 0 110 2h-1a1 1 0 01-1-1v-.5a2.5 2.5 0 00-5 0v.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" clipRule="evenodd" />
                </svg>
            )}
        </button>
    );
};

export const ControlPanel: React.FC<ControlPanelProps> = ({ onGenerate, disabled, T, language, onSaveCase, onOpenSavedWork, onOpenClinicalTools, isCaseActive, onGenerateNew }) => {
  const [conditionInput, setConditionInput] = useState("Type 2 Diabetes Mellitus");
  const [disciplineInput, setDisciplineInput] = useState("Medicine");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [history, setHistory] = useState<{ condition: string; discipline: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  
  const [isListening, setIsListening] = useState(false);
  const [activeInput, setActiveInput] = useState<'condition' | 'discipline' | null>(null);
  const recognitionRef = useRef<any>(null);
  const [micError, setMicError] = useState<string | null>(null);
  
  const [isSavedWorkMenuOpen, setIsSavedWorkMenuOpen] = useState(false);
  const savedWorkMenuRef = useRef<HTMLDivElement>(null);


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
        if (savedWorkMenuRef.current && !savedWorkMenuRef.current.contains(event.target as Node)) {
            setIsSavedWorkMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

   useEffect(() => {
    if (!isSpeechRecognitionSupported) {
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => {
        setIsListening(true);
        setMicError(null);
    };
    recognition.onend = () => {
        setIsListening(false);
        setActiveInput(null);
    };
    recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setMicError(T.micPermissionError);
        } else {
            setMicError(T.micGenericError);
        }
        setIsListening(false);
        setActiveInput(null);
    };

    recognitionRef.current = recognition;

    return () => {
        if(recognitionRef.current) {
            recognitionRef.current.abort();
        }
    };
  }, [T]);

  const handleMicClick = (targetInput: 'condition' | 'discipline') => {
      const recognition = recognitionRef.current;
      if (!recognition) return;

      if (isListening) {
          recognition.stop();
      } else {
          setActiveInput(targetInput);
          recognition.lang = language;
          recognition.onresult = (event: any) => {
              const transcript = event.results[0][0].transcript;
              if (targetInput === 'condition') {
                  setConditionInput(transcript);
              } else if (targetInput === 'discipline') {
                  setDisciplineInput(transcript);
              }
          };
          recognition.start();
      }
  };

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
      {!isCaseActive && (
        <>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
            <div className="flex flex-col sm:flex-1 sm:min-w-[240px]">
                <label htmlFor="condition-input" className="font-semibold text-gray-700 text-sm mb-1">
                    {T.conditionLabel}
                </label>
                <div className="relative">
                    <input
                    type="text"
                    id="condition-input"
                    value={conditionInput}
                    onChange={(e) => setConditionInput(e.target.value)}
                    disabled={disabled}
                    placeholder={T.conditionPlaceholder}
                    className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition w-full bg-gray-50 text-black pr-10"
                    />
                    {isSpeechRecognitionSupported && (
                        <MicButton
                            onClick={() => handleMicClick('condition')}
                            isListening={isListening && activeInput === 'condition'}
                            disabled={disabled || (isListening && activeInput !== 'condition')}
                            title="Use voice input for condition"
                        />
                    )}
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-1 sm:min-w-[240px]">
                <label htmlFor="discipline-input" className="font-semibold text-gray-700 text-sm mb-1">
                    {T.disciplineLabel}
                </label>
                <div className="relative">
                    <input
                    type="text"
                    id="discipline-input"
                    value={disciplineInput}
                    onChange={(e) => setDisciplineInput(e.target.value)}
                    disabled={disabled}
                    placeholder={T.disciplinePlaceholder}
                    className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition w-full bg-gray-50 text-black pr-10"
                    />
                    {isSpeechRecognitionSupported && (
                        <MicButton
                            onClick={() => handleMicClick('discipline')}
                            isListening={isListening && activeInput === 'discipline'}
                            disabled={disabled || (isListening && activeInput !== 'discipline')}
                            title="Use voice input for discipline"
                        />
                    )}
                </div>
            </div>
            
            <div className="flex flex-col w-full sm:w-auto">
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

            <div className="w-full sm:w-auto flex items-end space-x-2">
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
            {micError && (
                <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{micError}</span>
                </div>
            )}
        </>
      )}
      <div className={`${!isCaseActive ? 'border-t border-gray-200 mt-4 pt-3' : ''} flex items-center justify-between`}>
         <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={savedWorkMenuRef}>
                <button
                    onClick={() => setIsSavedWorkMenuOpen(prev => !prev)}
                    disabled={disabled}
                    title={T.savedWorkButton}
                    className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span>{T.savedWorkButton}</span>
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
                {isSavedWorkMenuOpen && (
                    <div className="absolute top-full mt-2 left-0 w-56 bg-white rounded-md shadow-lg border border-gray-200 z-20 animate-fade-in">
                        <ul className="py-1">
                            <li>
                                <button
                                    onClick={() => { onSaveCase(); setIsSavedWorkMenuOpen(false); }}
                                    disabled={disabled || !isCaseActive}
                                    title={!isCaseActive ? T.saveCaseDisabledTooltip : T.saveCaseButton}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center space-x-3"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v12a1 1 0 01-1.447.894L10 14.586l-3.553 2.308A1 1 0 015 16V4z" />
                                    </svg>
                                    <span>{T.saveCaseButton}</span>
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => { onOpenSavedWork(); setIsSavedWorkMenuOpen(false); }}
                                    disabled={disabled}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:text-gray-400 flex items-center space-x-3"
                                >
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2-1a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H4z" clipRule="evenodd" />
                                        <path d="M6 9a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" />
                                    </svg>
                                    <span>{T.viewSavedWorkButton}</span>
                                </button>
                            </li>
                        </ul>
                    </div>
                )}
            </div>
            <button
              onClick={onOpenClinicalTools}
              disabled={disabled}
              title={T.clinicalToolsButton}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-sm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              <span>{T.clinicalToolsButton}</span>
            </button>
        </div>
        {isCaseActive && (
          <button
            onClick={onGenerateNew}
            disabled={disabled}
            className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-sm"
          >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110 2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              <span>{T.generateNewCaseButton}</span>
          </button>
        )}
      </div>
    </div>
  );
};
