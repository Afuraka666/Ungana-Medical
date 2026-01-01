
import React, { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { EducationalContentType, Discipline } from '../types';
import type { PatientCase, EducationalContent, QuizQuestion, DisciplineSpecificConsideration, MultidisciplinaryConnection, TraceableEvidence, FurtherReading, ProcedureDetails, PatientOutcome, KnowledgeMapData } from '../types';
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

interface PatientCaseViewProps {
  patientCase: PatientCase;
  isGeneratingDetails: boolean;
  onSave: (updatedCase: PatientCase) => void;
  language: string;
  T: Record<string, any>;
  onSaveSnippet: (title: string, content: string) => void;
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

const formatCaseForClipboard = (patientCase: PatientCase, T: Record<string, any>): string => {
    let text = `Title: ${patientCase.title}\n\n`;
    const addSect = (t: string, c: string) => { text += `## ${t}\n${c}\n\n`; };
    addSect(T.patientProfile, patientCase.patientProfile);
    addSect(T.presentingComplaint, patientCase.presentingComplaint);
    addSect(T.history, patientCase.history);
    return text;
};

const SkeletonLoader: React.FC = () => (
    <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-full"></div>
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-5/6"></div>
    </div>
);

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
      {groundingSources && Array.isArray(groundingSources) && groundingSources.length > 0 && (
          <div className="mt-1.5 p-2 bg-slate-50 dark:bg-slate-800/30 border border-gray-100 dark:border-dark-border rounded-lg shadow-xs">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Clinical Sources Verified</p>
              <ul className="space-y-0.5">
                  {groundingSources.map((s, i) => s.web?.uri ? <li key={i} className="text-[10px] flex items-start gap-1.5 text-blue-600 dark:text-blue-400"><svg className="w-2.5 h-2.5 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" /></svg><a href={s.web.uri} target="_blank" rel="noopener noreferrer" className="hover:underline break-all font-semibold">{s.web.title || s.web.uri}</a></li> : null)}
              </ul>
          </div>
      )}
    </section>
  );
};

const SmartContent: React.FC<{ content: string; language: string; T: Record<string, any>; onTriggerIllustration: (desc: string) => void }> = ({ content, language, T, onTriggerIllustration }) => {
    const graphMatches = [...content.matchAll(/\[GRAPH:\s*(.*?)\s*\]/g)];
    const illustrateMatches = [...content.matchAll(/\[ILLUSTRATE:\s*(.*?)\s*\]/g)];
    const cleanContent = content.replace(/\[GRAPH:.*?\]/g, '').replace(/\[ILLUSTRATE:.*?\]/g, '').replace(/\[DIAGRAM:.*?\]/g, '').trim();
    
    return (
        <div className="space-y-1.5">
            <MarkdownRenderer content={cleanContent} />
            <div className="pt-0.5">
                <SourceRenderer text={content} />
            </div>
            {graphMatches.length > 0 && (
                <div className="space-y-2 mt-1">
                    {graphMatches.map((m, i) => <ScientificGraph key={i} type={m[1].trim() as any} title="Physiological Model Visualization" />)}
                </div>
            )}
            {illustrateMatches.length > 0 && (
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

export const PatientCaseView: React.FC<PatientCaseViewProps> = ({ patientCase: initialCase, isGeneratingDetails, onSave, language, T, onSaveSnippet, onOpenShare, onOpenDiscussion, onGetMapImage, mapData }) => {
  const { state: patientCase, setState: setPatientCase, undo, redo, canUndo, canRedo, resetState } = useHistoryState<PatientCase>(initialCase);
  const [isEditing, setIsEditing] = useState(false);
  const [activeImageGenerator, setActiveImageGenerator] = useState<{ content: EducationalContent; index: number } | null>(null);
  const [activeSourceSearch, setActiveSourceSearch] = useState<string | null>(null);
  const [isEnrichingEvidence, setIsEnrichingEvidence] = useState(false);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  useEffect(() => { resetState(initialCase); }, [initialCase, resetState]);
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, key: keyof PatientCase) => setPatientCase({ ...patientCase, [key]: e.target.value });
  const handleSave = () => { onSave(patientCase); setIsEditing(false); };
  const handleCancel = () => { resetState(initialCase); setIsEditing(false); };
  const handleTriggerIllustration = (desc: string, sourceIndex: number) => { setActiveImageGenerator({ content: { title: 'Clinical Visualization', description: desc, type: EducationalContentType.IMAGE, reference: 'AI-Synthesized Evidence' }, index: sourceIndex }); };
  const handleImageGenerated = useCallback((idx: number, img: string) => { setPatientCase(prev => { const edu = [...(prev.educationalContent || [])]; if (idx >= 0 && edu[idx]) { edu[idx] = { ...edu[idx], imageData: img }; } return { ...prev, educationalContent: edu }; }); setActiveImageGenerator(null); }, [setPatientCase]);
  const handleEnrichSources = async () => { setIsEnrichingEvidence(true); try { const { newEvidence, newReadings, groundingSources: gs } = await enrichCaseWithWebSources(patientCase, language); setPatientCase(prev => ({ ...prev, traceableEvidence: [...(prev.traceableEvidence || []), ...newEvidence], furtherReadings: [...(prev.furtherReadings || []), ...newReadings] })); setGroundingSources(gs); } catch (e) { console.error(e); } finally { setIsEnrichingEvidence(false); } };
  const EditableText: React.FC<{ value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; isEditing: boolean; }> = ({ value, onChange, isEditing }) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { if (isEditing && ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${ref.current.scrollHeight}px`; } }, [isEditing, value]);
    return isEditing ? <textarea ref={ref} value={value} onChange={onChange} className="w-full p-3 border border-blue-200 dark:border-blue-800 rounded-lg focus:ring-4 focus:ring-brand-blue/10 bg-blue-50/50 dark:bg-blue-900/20 text-black dark:text-white resize-none transition-all shadow-inner font-serif" /> : <SmartContent content={value} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} />;
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
        <Section title={T.patientProfile} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.patientProfile, patientCase.patientProfile)} T={T}><EditableText value={patientCase.patientProfile} onChange={(e) => handleTextChange(e, 'patientProfile')} isEditing={isEditing} /></Section>
        <Section title={T.presentingComplaint} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.presentingComplaint, patientCase.presentingComplaint)} T={T}><EditableText value={patientCase.presentingComplaint} onChange={(e) => handleTextChange(e, 'presentingComplaint')} isEditing={isEditing} /></Section>
        <Section title={T.history} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.history, patientCase.history)} T={T}><EditableText value={patientCase.history} onChange={(e) => handleTextChange(e, 'history')} isEditing={isEditing} /></Section>
        
        { patientCase.biochemicalPathway ? (
            <Section 
              title={T.biochemicalPathwaySection} 
              onCopy={() => {}} 
              onSaveSnippet={() => onSaveSnippet(patientCase.biochemicalPathway!.title, patientCase.biochemicalPathway!.description)} 
              T={T}
              groundingSources={patientCase.groundingSources}
            >
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2"><h4 className="text-sm font-black text-gray-900 dark:text-slate-100 uppercase tracking-tighter">{patientCase.biochemicalPathway.title}</h4><TextToSpeechPlayer textToRead={`${patientCase.biochemicalPathway.title}. ${patientCase.biochemicalPathway.description}`} language={language} /></div>
                    <button onClick={() => onOpenDiscussion({ aspect: patientCase.biochemicalPathway!.title, consideration: patientCase.biochemicalPathway!.description })} className="text-[8px] bg-brand-blue dark:bg-brand-blue-light text-white font-black py-1 px-2.5 rounded-full shadow-xs transition-transform hover:scale-105 uppercase tracking-widest">{T.discussButton}</button>
                </div>
                <p className="text-[8px] text-gray-400 font-mono mb-1 uppercase tracking-tighter">{patientCase.biochemicalPathway.reference}</p>
                <SmartContent content={patientCase.biochemicalPathway.description} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} />
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
                            <button onClick={() => onOpenDiscussion({ aspect: conn.discipline, connection: conn.connection } as any)} className="self-end flex items-center gap-1 text-[8px] bg-white dark:bg-slate-700 border border-blue-100 dark:border-blue-900 text-brand-blue dark:text-blue-300 hover:bg-brand-blue hover:text-white font-black py-1 px-2.5 rounded-full transition-all shadow-xs uppercase tracking-widest">Consult</button>
                        </div>
                    ))}
                </div>
            </Section>
        ) : isGeneratingDetails ? <Section title={T.multidisciplinaryConnections} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }

        { Array.isArray(patientCase.disciplineSpecificConsiderations) && patientCase.disciplineSpecificConsiderations.length > 0 ? (
            <Section title={T.managementConsiderations} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.managementConsiderations, patientCase.disciplineSpecificConsiderations!.map(c => `${c.aspect}: ${c.consideration}`).join('\n'))} T={T}>
                <ul className="space-y-2">
                    {patientCase.disciplineSpecificConsiderations.map((item, idx) => (
                        <li key={idx} className="bg-white dark:bg-dark-surface p-3 rounded-xl border border-gray-100 dark:border-dark-border shadow-xs">
                            <div className="flex justify-between items-center mb-1 border-b border-gray-50 dark:border-dark-border pb-1">
                                <strong className="text-xs font-black text-gray-900 dark:text-slate-200 tracking-tight uppercase">{item.aspect}</strong>
                                <button onClick={() => onOpenDiscussion(item)} className="text-[8px] bg-blue-50 dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 font-black py-1 px-2.5 rounded-full border border-blue-100 dark:border-blue-900 transition-all hover:bg-brand-blue hover:text-white uppercase tracking-widest">{T.discussButton}</button>
                            </div>
                            <div className="mt-1"><SmartContent content={item.consideration} language={language} T={T} onTriggerIllustration={(d) => handleTriggerIllustration(d, -1)} /></div>
                        </li>
                    ))}
                </ul>
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
