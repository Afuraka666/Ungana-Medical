
import React, { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { EducationalContentType, Discipline } from '../types';
import type { PatientCase, EducationalContent, QuizQuestion, DisciplineSpecificConsideration, MultidisciplinaryConnection, TraceableEvidence, FurtherReading, ProcedureDetails, PatientOutcome, KnowledgeMapData, Snippet } from '../types';
import { DisciplineColors } from './KnowledgeMap';
import { QuizView } from './QuizView';
import { ImageGenerator } from './ImageGenerator';
import { TextToSpeechPlayer } from './TextToSpeechPlayer';
import { InteractiveDiagram } from './InteractiveDiagram';
import { SourceSearchModal } from './SourceSearchModal';
import { enrichCaseWithWebSources } from '../services/geminiService';
import { DisciplineIcon } from './DisciplineIcon';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SourceRenderer } from './SourceRenderer';
import { ScientificGraph } from './ScientificGraph';
import { AudioVisualizer } from './AudioVisualizer';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

const getBCP47Language = (lang: string): string => {
    const map: Record<string, string> = {
        'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'zh': 'zh-CN', 'hi': 'hi-IN',
        'sw': 'sw-KE', 'sn': 'sn-ZW', 'nd': 'nd-ZW', 'bem': 'en-ZM', 'ny': 'ny-MW',
        'ar': 'ar-SA', 'pt': 'pt-PT', 'ru': 'ru-RU', 'tn': 'tn-ZA', 'el': 'el-GR',
    };
    return map[lang] || 'en-US';
};

interface PatientCaseViewProps {
  patientCase: PatientCase;
  isGeneratingDetails: boolean;
  onSave: (updatedCase: PatientCase) => void;
  language: string;
  T: Record<string, any>;
  onSaveSnippet: (title: string, content: string, visualData?: Partial<Snippet>) => void;
  onOpenShare: () => void;
  onOpenDiscussion: (topic: DisciplineSpecificConsideration) => void;
  onGetMapImage?: () => Promise<string | undefined>;
  mapData: KnowledgeMapData | null;
}

const historyReducer = (state: { history: any[], currentIndex: number }, action: { type: string, payload: any }): { history: any[], currentIndex: number } => {
    switch (action.type) {
        case 'SET_STATE': {
            const { newState } = action.payload;
            if (JSON.stringify(newState) === JSON.stringify(state.history[state.currentIndex])) return state;
            const newHistory = state.history.slice(0, state.currentIndex + 1);
            newHistory.push(newState);
            return { history: newHistory, currentIndex: newHistory.length - 1 };
        }
        case 'UNDO': return { ...state, currentIndex: Math.max(0, state.currentIndex - 1) };
        case 'REDO': return { ...state, currentIndex: Math.min(state.history.length - 1, state.currentIndex + 1) };
        case 'RESET_STATE': return { history: [action.payload.initialState], currentIndex: 0 };
        default: return state;
    }
}

function useHistoryState<T>(initialState: T) {
  const [state, dispatch] = useReducer(historyReducer, { history: [initialState], currentIndex: 0 });
  const { history, currentIndex } = state;
  const currentState = history[currentIndex];
  const setState = useCallback((newState: T | ((prevState: T) => T)) => {
    const value = typeof newState === 'function' ? (newState as (prevState: T) => T)(currentState) : newState;
    dispatch({ type: 'SET_STATE', payload: { newState: value } });
  }, [currentState]);
  const undo = useCallback(() => dispatch({ type: 'UNDO', payload: {} }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO', payload: {} }), []);
  const resetState = useCallback((newState: T) => dispatch({ type: 'RESET_STATE', payload: { initialState: newState } }), []);
  return { state: currentState, setState, undo, redo, canUndo: currentIndex > 0, canRedo: currentIndex < history.length - 1, resetState };
}

const Section: React.FC<{
  title: string;
  onCopy: () => void;
  onSaveSnippet: () => void;
  T: Record<string, any>;
  onEnrich?: () => void;
  isEnriching?: boolean;
  groundingSources?: any[];
  children: React.ReactNode;
}> = ({ title, onCopy, onSaveSnippet, onEnrich, isEnriching, groundingSources, children, T }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isSnippetSaved, setIsSnippetSaved] = useState(false);
  const handleCopy = () => { onCopy(); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); };
  const handleSaveSnippet = () => { onSaveSnippet(); setIsSnippetSaved(true); setTimeout(() => setIsSnippetSaved(false), 2000); };
  return (
    <section className="mt-2 sm:mt-4 first:mt-0">
      <div className="flex items-center justify-between mb-1 pb-1 border-b border-brand-blue/20 dark:border-brand-blue-light/10">
        <h3 className="text-sm sm:text-base font-black text-brand-blue dark:text-brand-blue-light uppercase tracking-tight">{title}</h3>
        <div className="flex items-center space-x-1">
            {onEnrich && (
                <button onClick={onEnrich} disabled={isEnriching} title="Find current sources" className="p-1 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-brand-blue transition">
                    {isEnriching ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3.5a1.5 1.5 0 011.5 1.5v2.086l2.723-2.723a.75.75 0 111.06 1.06L12.564 8.15l2.724 2.724a.75.75 0 11-1.06 1.06L11.5 9.22v2.085a1.5 1.5 0 01-3 0V9.22l-2.724 2.724a.75.75 0 11-1.06-1.06L7.436 8.15 4.712 5.426a.75.75 0 111.06-1.06L8.5 7.085V5A1.5 1.5 0 0110 3.5z" /></svg>}
                </button>
            )}
           <button onClick={handleSaveSnippet} title="Save Snippet" className="p-1 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-brand-blue transition">
              {isSnippetSaved ? <svg className="h-3.5 w-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v12a1 1 0 01-1.447.894L10 14.586l-3.553 2.308A1 1 0 015 16V4z" /></svg>}
            </button>
          <button onClick={handleCopy} title="Copy Section" className="p-1 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-brand-blue transition">
            {isCopied ? <svg className="h-3.5 w-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" /></svg>}
          </button>
        </div>
      </div>
      <div className="text-xs sm:text-sm text-brand-text dark:text-dark-text leading-relaxed">{children}</div>
    </section>
  );
};

const SmartContent: React.FC<{ content: string; language: string; T: Record<string, any>; onTriggerIllustration: (desc: string) => void; allowVisuals?: boolean }> = ({ content, language, T, onTriggerIllustration, allowVisuals = false }) => {
    const graphMatches = allowVisuals ? [...content.matchAll(/\[GRAPH:\s*(.*?)\s*\]/g)] : [];
    const illustrateMatches = allowVisuals ? [...content.matchAll(/\[ILLUSTRATE:\s*(.*?)\s*\]/g)] : [];
    
    // Strictly filter out graph/illustration tags if not allowed (e.g., in history section)
    const cleanContent = content.replace(/\[GRAPH:.*?\]/g, '').replace(/\[ILLUSTRATE:.*?\]/g, '').replace(/\[DIAGRAM:.*?\]/g, '').trim();
    
    return (
        <div className="space-y-1.5">
            <MarkdownRenderer content={cleanContent} />
            <div className="pt-0.5">
                <SourceRenderer text={content} />
            </div>
            {allowVisuals && graphMatches.length > 0 && (
                <div className="space-y-2 mt-1">
                    {graphMatches.map((m, i) => <ScientificGraph key={i} type={m[1].trim() as any} title="Physiological Model Visualization" />)}
                </div>
            )}
            {allowVisuals && illustrateMatches.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                    {illustrateMatches.map((m, i) => (
                        <button key={i} onClick={() => onTriggerIllustration(m[1].trim())} title="Generate Clinical Illustration" className="group flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all text-[9px] font-black shadow-xs">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            VISUAL VERIFICATION
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const SkeletonLoader: React.FC = () => (
    <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-full"></div>
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-5/6"></div>
    </div>
);

export const PatientCaseView: React.FC<PatientCaseViewProps> = ({ patientCase: initialCase, isGeneratingDetails, onSave, language, T, onSaveSnippet, onOpenShare, onOpenDiscussion, onGetMapImage, mapData }) => {
  const { state: patientCase, setState: setPatientCase, undo, redo, canUndo, canRedo, resetState } = useHistoryState<PatientCase>(initialCase);
  const [isEditing, setIsEditing] = useState(false);
  const [activeImageGenerator, setActiveImageGenerator] = useState<{ content: EducationalContent; index: number } | null>(null);
  const [activeSourceSearch, setActiveSourceSearch] = useState<string | null>(null);
  const [isEnrichingEvidence, setIsEnrichingEvidence] = useState(false);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { resetState(initialCase); }, [initialCase, resetState]);

  const handleTextChange = (value: string, key: keyof PatientCase) => setPatientCase({ ...patientCase, [key]: value });
  const handleSave = () => { onSave(patientCase); setIsEditing(false); };
  const handleCancel = () => { resetState(initialCase); setIsEditing(false); };

  const handleMicClick = useCallback((key: keyof PatientCase) => {
    if (!isSpeechRecognitionSupported) return;
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); return; }
    
    const recognition = new SpeechRecognition();
    recognition.lang = getBCP47Language(language);
    recognition.continuous = false;
    recognition.interimResults = true;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript;
        handleTextChange(transcript, key);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening, language, patientCase]);

  const handleTriggerIllustration = (desc: string, sourceIndex: number) => { 
    setActiveImageGenerator({ content: { title: 'Clinical Visualization', description: desc, type: EducationalContentType.IMAGE, reference: 'AI-Synthesized Evidence' }, index: sourceIndex }); 
  };

  const handleImageGenerated = useCallback((idx: number, img: string) => { 
    setPatientCase(prev => { 
        const edu = [...(prev.educationalContent || [])]; 
        if (idx >= 0 && edu[idx]) { edu[idx] = { ...edu[idx], imageData: img }; } 
        return { ...prev, educationalContent: edu }; 
    }); 
    setActiveImageGenerator(null); 
  }, [setPatientCase]);

  const handleEnrichSources = async () => { 
    setIsEnrichingEvidence(true); 
    try { 
        const { newEvidence, newReadings, groundingSources: gs } = await enrichCaseWithWebSources(patientCase, language); 
        setPatientCase(prev => ({ ...prev, traceableEvidence: [...(prev.traceableEvidence || []), ...newEvidence], furtherReadings: [...(prev.furtherReadings || []), ...newReadings] })); 
        setGroundingSources(gs); 
    } catch (e) { console.error(e); } 
    finally { setIsEnrichingEvidence(false); } 
  };

  const EditableField: React.FC<{ value: string; fieldKey: keyof PatientCase; isEditing: boolean; allowVisuals?: boolean }> = ({ value, fieldKey, isEditing, allowVisuals = false }) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { if (isEditing && ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${ref.current.scrollHeight}px`; } }, [isEditing, value]);
    
    if (isEditing) {
        return (
            <div className="relative group">
                <textarea 
                    ref={ref} 
                    value={value} 
                    onChange={(e) => handleTextChange(e.target.value, fieldKey)} 
                    className="w-full p-3 pr-12 border border-blue-200 dark:border-blue-800 rounded-lg focus:ring-4 focus:ring-brand-blue/10 bg-blue-50/50 dark:bg-blue-900/20 text-black dark:text-white resize-none transition-all shadow-inner font-serif min-h-[100px]" 
                />
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button 
                        type="button"
                        onClick={() => handleMicClick(fieldKey)} 
                        className={`p-2 rounded-full transition shadow-sm ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white dark:bg-slate-800 text-gray-500 border border-gray-200 dark:border-slate-700 hover:bg-gray-100'}`}
                        title="Voice input"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm-1 4a4 4 0 108 0V4a4 4 0 10-8 0v4zM2 11a1 1 0 011-1h1a1 1 0 011 1v.5a.5.5 0 001 0V11a3 3 0 013-3h0a3 3 0 013 3v.5a.5.5 0 001 0V11a1 1 0 011 1h1a1 1 0 110 2h-1a1 1 0 01-1-1v-.5a2.5 2.5 0 00-5 0v.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" clipRule="evenodd" />
                        </svg>
                    </button>
                    {isListening && <div className="mx-auto"><AudioVisualizer isListening={isListening} /></div>}
                </div>
            </div>
        );
    }
    return <SmartContent content={value} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} allowVisuals={allowVisuals} />;
  };

  return (
    <div className="p-3 sm:p-5 relative bg-white dark:bg-dark-surface transition-colors duration-300">
      <header className="sticky top-0 -mx-3 sm:-mx-5 -mt-3 sm:-mt-5 p-2 sm:p-3 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md border-b border-gray-100 dark:border-dark-border z-20 shadow-sm mb-4">
        <div className="flex justify-between items-center max-w-5xl mx-auto">
          <h2 className="text-lg sm:text-xl font-black text-brand-text dark:text-dark-text truncate tracking-tight pr-4">{patientCase.title}</h2>
          <div className="flex items-center gap-1">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <button onClick={undo} disabled={!canUndo} title="Undo" className="p-1 text-gray-400 hover:text-brand-blue disabled:opacity-20 transition-colors"><svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg></button>
                <button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white font-black py-1 px-2.5 rounded-md text-[10px] shadow-sm transition-all">SAVE</button>
                <button onClick={handleCancel} className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-black py-1 px-2.5 rounded-md text-[10px] transition-all">CANCEL</button>
              </div>
            ) : (
              <>
                <button onClick={onOpenShare} title="Share Case" className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-all"><svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg></button>
                <button onClick={() => setIsEditing(true)} title="Edit Text" className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-all"><svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg></button>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="space-y-3 max-w-5xl mx-auto">
        <Section title={T.patientProfile} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.patientProfile, patientCase.patientProfile)} T={T}><EditableField value={patientCase.patientProfile} fieldKey="patientProfile" isEditing={isEditing} /></Section>
        <Section title={T.presentingComplaint} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.presentingComplaint, patientCase.presentingComplaint)} T={T}><EditableField value={patientCase.presentingComplaint} fieldKey="presentingComplaint" isEditing={isEditing} /></Section>
        <Section title={T.history} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.history, patientCase.history)} T={T}><EditableField value={patientCase.history} fieldKey="history" isEditing={isEditing} /></Section>
        
        { patientCase.biochemicalPathway ? (
            <Section 
              title={T.biochemicalPathwaySection} 
              onCopy={() => {}} 
              onSaveSnippet={() => onSaveSnippet(patientCase.biochemicalPathway!.title, patientCase.biochemicalPathway!.description, { diagramData: patientCase.biochemicalPathway!.diagramData })} 
              T={T}
              groundingSources={patientCase.groundingSources}
            >
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2"><h4 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tighter">{patientCase.biochemicalPathway.title}</h4><TextToSpeechPlayer textToRead={`${patientCase.biochemicalPathway.title}. ${patientCase.biochemicalPathway.description}`} language={language} /></div>
                    <button onClick={() => onOpenDiscussion({ aspect: patientCase.biochemicalPathway!.title, consideration: patientCase.biochemicalPathway!.description })} className="text-[8px] bg-brand-blue dark:bg-brand-blue-light text-white font-black py-1 px-2.5 rounded-full shadow-xs transition-transform hover:scale-105 uppercase tracking-widest">{T.discussButton}</button>
                </div>
                <p className="text-[8px] text-gray-400 font-mono mb-1 uppercase tracking-tighter">{patientCase.biochemicalPathway.reference}</p>
                <SmartContent content={patientCase.biochemicalPathway.description} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} allowVisuals={true} />
                {patientCase.biochemicalPathway.diagramData && <div className="mt-2 h-[280px] rounded-xl border border-gray-100 dark:border-dark-border shadow-xs overflow-hidden"><InteractiveDiagram id="diagram-biochem" data={patientCase.biochemicalPathway.diagramData} /></div>}
            </Section>
        ) : isGeneratingDetails ? <Section title={T.biochemicalPathwaySection} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }

        { Array.isArray(patientCase.multidisciplinaryConnections) && patientCase.multidisciplinaryConnections.length > 0 ? (
            <Section title={T.multidisciplinaryConnections} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.multidisciplinaryConnections, patientCase.multidisciplinaryConnections!.map(c => `${c.discipline}: ${c.connection}`).join('\n'))} T={T}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                    {patientCase.multidisciplinaryConnections.map((conn, idx) => (
                        <div key={idx} className="bg-slate-50 dark:bg-slate-800/40 border border-gray-100 dark:border-dark-border rounded-xl p-3 transition-all hover:shadow-sm flex flex-col justify-between h-full border-l-4" style={{ borderLeftColor: DisciplineColors[conn.discipline] }}>
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div className="p-1 rounded-lg bg-white dark:bg-slate-900 shadow-xs"><DisciplineIcon discipline={conn.discipline} className="h-3.5 w-3.5" style={{ color: DisciplineColors[conn.discipline] }} /></div>
                                    <h5 className="text-xs font-black text-gray-900 dark:text-slate-100 tracking-tight uppercase">{conn.discipline}</h5>
                                </div>
                                <div className="text-[11px] text-gray-700 dark:text-slate-300 leading-relaxed mb-2"><SmartContent content={conn.connection} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} /></div>
                            </div>
                            <button onClick={() => onOpenDiscussion({ aspect: conn.discipline, consideration: conn.connection })} className="self-end flex items-center gap-1 text-[8px] bg-white dark:bg-slate-700 border border-blue-100 dark:border-blue-900 text-brand-blue dark:text-blue-300 hover:bg-brand-blue hover:text-white font-black py-1 px-2.5 rounded-full transition-all shadow-xs uppercase tracking-widest">Consult</button>
                        </div>
                    ))}
                </div>
            </Section>
        ) : isGeneratingDetails ? <Section title={T.multidisciplinaryConnections} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }

        { Array.isArray(patientCase.disciplineSpecificConsiderations) && patientCase.disciplineSpecificConsiderations.length > 0 ? (
            <Section title={T.managementConsiderations} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.managementConsiderations, patientCase.disciplineSpecificConsiderations!.map(c => `${c.aspect}: ${c.consideration}`).join('\n'))} T={T}>
                <div className="space-y-4">
                    {patientCase.disciplineSpecificConsiderations.map((item, idx) => {
                        const isPhased = ["Preoperative", "Intraoperative", "Postoperative"].includes(item.aspect);
                        return (
                            <div key={idx} className={`bg-white dark:bg-dark-surface p-4 rounded-xl border ${isPhased ? 'border-brand-blue/30 border-l-[6px] dark:border-brand-blue-light/20' : 'border-gray-100 dark:border-dark-border'} shadow-sm transition-all`}>
                                <div className="flex justify-between items-center mb-2 border-b border-gray-50 dark:border-dark-border pb-2">
                                    <div className="flex items-center gap-2">
                                        {isPhased && <div className="h-2 w-2 rounded-full bg-brand-blue dark:bg-brand-blue-light animate-pulse" />}
                                        <strong className={`text-sm font-black tracking-tight uppercase ${isPhased ? 'text-brand-blue dark:text-brand-blue-light' : 'text-gray-900 dark:text-slate-200'}`}>
                                            {item.aspect}
                                        </strong>
                                    </div>
                                    <button onClick={() => onOpenDiscussion(item)} className="text-[8px] bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 font-black py-1 px-2.5 rounded-full border border-blue-100 dark:border-blue-900 transition-all hover:bg-brand-blue hover:text-white uppercase tracking-widest shadow-xs">
                                        {T.discussButton}
                                    </button>
                                </div>
                                <div className="mt-1"><SmartContent content={item.consideration} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} /></div>
                            </div>
                        );
                    })}
                </div>
            </Section>
        ) : isGeneratingDetails ? <Section title={T.managementConsiderations} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }

        { (Array.isArray(patientCase.traceableEvidence) && patientCase.traceableEvidence.length > 0) || (Array.isArray(patientCase.furtherReadings) && patientCase.furtherReadings.length > 0) ? (
            <Section title={T.evidenceAndReading} onCopy={() => {}} onSaveSnippet={() => {}} T={T} onEnrich={handleEnrichSources} isEnriching={isEnrichingEvidence} groundingSources={groundingSources}>
                {Array.isArray(patientCase.traceableEvidence) && patientCase.traceableEvidence.length > 0 && (
                    <div className="mb-2"><h4 className="font-black text-xs text-gray-900 dark:text-slate-100 mb-1 flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.9L9.03 9.069a2.25 2.25 0 002.248 0l6.863-4.17A2.25 2.25 0 0015.83 2H4.477a2.25 2.25 0 00-2.311 2.9z" /><path d="M11 11.235V20l7-4.24V8.765l-7 2.47z" /><path d="M9 11.235V20L2 15.76V8.765l7 2.47z" /></svg>{T.traceableEvidence}</h4><ul className="space-y-1">{patientCase.traceableEvidence.map((e, i) => <li key={i} className="bg-slate-50 dark:bg-slate-800/20 p-2 rounded-lg border-l-4 border-green-500"><span className="font-bold block text-[10px] text-gray-800 dark:text-slate-100 mb-0.5">"{e.claim}"</span> <span className="block text-[9px]"><SourceRenderer text={e.source} onSearchClick={() => setActiveSourceSearch(e.source)} /></span></li>)}</ul></div>
                )}
            </Section>
        ) : isGeneratingDetails ? <Section title={T.evidenceAndReading} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }
        
        { patientCase.quiz ? <QuizView quiz={patientCase.quiz} T={T} /> : isGeneratingDetails ? <Section title={T.quizTitle} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }
      </div>
      {activeImageGenerator && <ImageGenerator content={activeImageGenerator.content} onClose={() => setActiveImageGenerator(null)} language={language} T={T} onImageGenerated={(img) => handleImageGenerated(activeImageGenerator.index, img)} />}
      {activeSourceSearch && <SourceSearchModal isOpen={!!activeSourceSearch} onClose={() => setActiveSourceSearch(null)} sourceQuery={activeSourceSearch} language={language} T={T} />}
    </div>
  );
};
