
import React, { useState, useEffect, useRef } from 'react';
import { AudioVisualizer } from './AudioVisualizer';

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
  mobileView: 'case' | 'map';
  onSetMobileView: (view: 'case' | 'map') => void;
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
            className="absolute right-0 top-0 h-full px-2.5 flex items-center text-gray-400 hover:text-brand-blue-light disabled:text-gray-300 disabled:cursor-not-allowed transition-colors gap-2"
        >
            <AudioVisualizer isListening={isListening} />
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

export const ControlPanel: React.FC<ControlPanelProps> = ({ 
    onGenerate, disabled, T, language, onSaveCase, onOpenSavedWork, 
    onOpenClinicalTools, isCaseActive, onGenerateNew, mobileView, onSetMobileView 
}) => {
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
      if (Array.isArray(storedHistory)) setHistory(storedHistory);
    } catch (e) { setHistory([]); }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (historyRef.current && !historyRef.current.contains(event.target as Node)) setShowHistory(false);
        if (savedWorkMenuRef.current && !savedWorkMenuRef.current.contains(event.target as Node)) setIsSavedWorkMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMicClick = (targetInput: 'condition' | 'discipline') => {
      if (!isSpeechRecognitionSupported) return;
      if (isListening && activeInput === targetInput && recognitionRef.current) { recognitionRef.current.stop(); return; }
      setMicError(null); setActiveInput(targetInput);
      const recognition = new SpeechRecognition();
      recognition.continuous = false; recognition.interimResults = true; recognition.maxAlternatives = 1;
      recognition.lang = language === 'bem' ? 'en-US' : language;
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => { setIsListening(false); setActiveInput(null); recognitionRef.current = null; };
      recognition.onerror = (event: any) => { setIsListening(false); setActiveInput(null); setMicError(event.error === 'not-allowed' ? T.micPermissionError : T.micGenericError); };
      recognition.onresult = (event: any) => { 
          const transcript = event.results[0][0].transcript; 
          if (targetInput === 'condition') setConditionInput(transcript); else setDisciplineInput(transcript); 
      };
      try { recognitionRef.current = recognition; recognition.start(); } catch (err: any) { setIsListening(false); setActiveInput(null); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const condition = conditionInput.trim();
    const discipline = disciplineInput.trim();
    if (condition && discipline && !disabled) {
      onGenerate(condition, discipline, difficulty);
      setHistory(prev => {
        const newEntry = { condition, discipline };
        if (prev.some(item => item.condition.toLowerCase() === condition.toLowerCase() && item.discipline.toLowerCase() === discipline.toLowerCase())) return prev;
        const updated = [newEntry, ...prev].slice(0, 15);
        localStorage.setItem('generationHistory', JSON.stringify(updated));
        return updated;
      });
    }
  };

  return (
    <div className="bg-white dark:bg-dark-surface p-4 rounded-lg shadow-md border border-gray-200 dark:border-dark-border transition-colors duration-300">
      {!isCaseActive ? (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
          <div className="flex flex-col sm:flex-1 sm:min-w-[240px]">
              <label htmlFor="condition-input" className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-1">{T.conditionLabel}</label>
              <div className="relative">
                  <input type="text" id="condition-input" value={conditionInput} onChange={(e) => setConditionInput(e.target.value)} disabled={disabled} placeholder={T.conditionPlaceholder} className="p-2 border border-gray-300 dark:border-dark-border rounded-md focus:ring-2 focus:ring-brand-blue-light w-full bg-gray-50 dark:bg-slate-700 text-black dark:text-white pr-10 transition-colors" />
                  {isSpeechRecognitionSupported && <MicButton onClick={() => handleMicClick('condition')} isListening={isListening && activeInput === 'condition'} disabled={disabled} title="Voice Input for Medical Condition" />}
              </div>
          </div>
          <div className="flex flex-col sm:flex-1 sm:min-w-[240px]">
              <label htmlFor="discipline-input" className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-1">{T.disciplineLabel}</label>
              <div className="relative">
                  <input type="text" id="discipline-input" value={disciplineInput} onChange={(e) => setDisciplineInput(e.target.value)} disabled={disabled} placeholder={T.disciplinePlaceholder} className="p-2 border border-gray-300 dark:border-dark-border rounded-md focus:ring-2 focus:ring-brand-blue-light w-full bg-gray-50 dark:bg-slate-700 text-black dark:text-white pr-10 transition-colors" />
                  {isSpeechRecognitionSupported && <MicButton onClick={() => handleMicClick('discipline')} isListening={isListening && activeInput === 'discipline'} disabled={disabled} title="Voice Input for Academic Discipline" />}
              </div>
          </div>
          <div className="flex flex-col w-full sm:w-auto">
              <label htmlFor="difficulty-select" className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-1">{T.difficultyLabel}</label>
              <select id="difficulty-select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={disabled} className="bg-gray-50 dark:bg-slate-700 p-2 border border-gray-300 dark:border-dark-border rounded-md h-[42px] pr-8 text-black dark:text-white transition-colors" title="Select medical complexity level">
                  <option value="beginner">{T.difficultyBeginner}</option>
                  <option value="intermediate">{T.difficultyIntermediate}</option>
                  <option value="advanced">{T.difficultyAdvanced}</option>
              </select>
          </div>
          <div className="w-full sm:w-auto flex items-end space-x-2">
              <div className="relative" ref={historyRef}>
                  <button type="button" onClick={() => setShowHistory(s => !s)} disabled={disabled} title="View previously generated cases" className="h-[42px] bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 font-bold p-2 rounded-md transition flex items-center justify-center border border-gray-300 dark:border-dark-border"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.415L11 9.586V6z" clipRule="evenodd" /></svg></button>
                  {showHistory && (
                      <div className="absolute bottom-full mb-2 right-0 w-80 bg-white dark:bg-dark-surface rounded-lg shadow-2xl border border-gray-200 dark:border-dark-border z-20 max-h-80 overflow-y-auto animate-fade-in">
                          <div className="p-3 border-b border-gray-200 dark:border-dark-border flex justify-between items-center sticky top-0 bg-white dark:bg-dark-surface"><h4 className="font-semibold text-gray-800 dark:text-slate-200">{T.historyTitle}</h4>{history.length > 0 && <button onClick={() => { setHistory([]); localStorage.removeItem('generationHistory'); setShowHistory(false); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear</button>}</div>
                          {history.length === 0 ? <p className="p-4 text-sm text-gray-500 text-center">{T.noHistoryMessage}</p> : <ul className="divide-y divide-gray-100 dark:divide-dark-border">{history.map((item, index) => <li key={index} onClick={() => { setConditionInput(item.condition); setDisciplineInput(item.discipline); setShowHistory(false); }} className="p-3 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition"><p className="font-medium text-sm text-gray-800 dark:text-slate-200 truncate">{item.condition}</p><p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.discipline}</p></li>)}</ul>}
                      </div>
                  )}
              </div>
              <button type="submit" disabled={disabled || !conditionInput.trim() || !disciplineInput.trim()} title="Launch AI case synthesis" className="flex-grow h-[42px] bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-md transition disabled:bg-gray-400 flex items-center justify-center space-x-2 shadow-lg hover:scale-[1.02] active:scale-95"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M12 6V3m0 18v-3"></path></svg><span>{T.generateButton}</span></button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative" ref={savedWorkMenuRef}>
                    <button onClick={() => setIsSavedWorkMenuOpen(!isSavedWorkMenuOpen)} disabled={disabled} title="Access your saved medical cases and snippets" className="bg-gray-600 dark:bg-slate-700 hover:bg-gray-700 dark:hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition flex items-center justify-center space-x-2 text-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg><span className="hidden sm:inline">Collection</span></button>
                    {isSavedWorkMenuOpen && (
                        <div className="absolute top-full mt-2 left-0 w-56 bg-white dark:bg-dark-surface rounded-md shadow-lg border border-gray-200 dark:border-dark-border z-20 animate-fade-in"><ul className="py-1">
                          <li><button onClick={() => { onSaveCase(); setIsSavedWorkMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center space-x-3" title="Store current case for future reference"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v12a1 1 0 01-1.447.894L10 14.586l-3.553 2.308A1 1 0 015 16V4z" /></svg><span>Save Case</span></button></li>
                          <li><button onClick={() => { onOpenSavedWork(); setIsSavedWorkMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center space-x-3" title="View all previously saved data"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2-1a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H4z" clipRule="evenodd" /><path d="M6 9a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" /></svg><span>Browse All</span></button></li>
                        </ul></div>
                    )}
                </div>
                <button onClick={onOpenClinicalTools} disabled={disabled} title="Quick medical calculators (Dosing, Fluid, ECG)" className="bg-indigo-600 dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-md transition flex items-center justify-center space-x-2 text-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg><span className="hidden sm:inline">Calculators</span></button>
            </div>
            <div className="lg:hidden"><div className="flex items-center bg-gray-200 dark:bg-slate-800 p-0.5 rounded-full transition-colors"><button onClick={() => onSetMobileView('case')} title="Switch to textual case view" className={`p-1.5 rounded-full transition ${mobileView === 'case' ? 'bg-white dark:bg-slate-700 text-brand-blue dark:text-brand-blue-light shadow-sm' : 'text-gray-500'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button><button onClick={() => onSetMobileView('map')} title="Switch to interactive knowledge map" className={`p-1.5 rounded-full transition ${mobileView === 'map' ? 'bg-white dark:bg-slate-700 text-brand-blue dark:text-brand-blue-light shadow-sm' : 'text-gray-500'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg></button></div></div>
            <button onClick={onGenerateNew} disabled={disabled} title="Clear current work and start a new synthesis" className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-md transition flex items-center justify-center space-x-2 text-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg><span className="hidden sm:inline">Reset</span></button>
        </div>
      )}
    </div>
  );
};
