
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
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';

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
    if (patientCase.procedureDetails) text += `## ${T.anestheticDataSection}\n- ${T.procedureLabel}: ${patientCase.procedureDetails.procedureName}\n- ${T.asaScoreLabel}: ${patientCase.procedureDetails.asaScore}\n\n`;
    if (patientCase.multidisciplinaryConnections) {
        text += `## ${T.multidisciplinaryConnections}\n`;
        patientCase.multidisciplinaryConnections.forEach(c => { text += `- ${c.discipline}: ${c.connection}\n`; });
        text += '\n';
    }
    return text;
};

const SkeletonLoader: React.FC = () => (
    <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded w-full"></div>
        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
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
    <section className="mt-4">
      <div className="flex items-center justify-between mb-2 pb-1 border-b-2 border-brand-blue/30">
        <h3 className="text-lg font-bold text-brand-blue">{title}</h3>
        <div className="flex items-center space-x-2">
            {onEnrich && (
                <button onClick={onEnrich} disabled={isEnriching} title={T.enrichButton} className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition disabled:cursor-not-allowed">
                    {isEnriching ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3.5a1.5 1.5 0 011.5 1.5v2.086l2.723-2.723a.75.75 0 111.06 1.06L12.564 8.15l2.724 2.724a.75.75 0 11-1.06 1.06L11.5 9.22v2.085a1.5 1.5 0 01-3 0V9.22l-2.724 2.724a.75.75 0 11-1.06-1.06L7.436 8.15 4.712 5.426a.75.75 0 111.06-1.06L8.5 7.085V5A1.5 1.5 0 0110 3.5z" /></svg>}
                </button>
            )}
           <button onClick={handleSaveSnippet} title={isSnippetSaved ? T.snippetSavedButton : T.saveSnippetButton} className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
              {isSnippetSaved ? <svg className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v12a1 1 0 01-1.447.894L10 14.586l-3.553 2.308A1 1 0 015 16V4z" /></svg>}
            </button>
          <button onClick={handleCopy} title={T.copySectionButton} className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
            {isCopied ? <svg className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" /></svg>}
          </button>
        </div>
      </div>
      <div className="text-sm text-brand-text space-y-2">{children}</div>
      {groundingSources && groundingSources.length > 0 && (
          <div className="mt-3 p-2 bg-gray-100 border border-gray-200 rounded-md">
              <p className="text-xs font-semibold text-gray-600">{T.groundingSourcesTitle}</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                  {groundingSources.map((s, i) => s.web?.uri ? <li key={i} className="text-xs"><a href={s.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{s.web.title || s.web.uri}</a></li> : null)}
              </ul>
          </div>
      )}
    </section>
  );
};

export const PatientCaseView: React.FC<PatientCaseViewProps> = ({ patientCase: initialCase, isGeneratingDetails, onSave, language, T, onSaveSnippet, onOpenShare, onOpenDiscussion, onGetMapImage, mapData }) => {
  const { state: patientCase, setState: setPatientCase, undo, redo, canUndo, canRedo, resetState } = useHistoryState<PatientCase>(initialCase);
  const [isEditing, setIsEditing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [activeImageGenerator, setActiveImageGenerator] = useState<{ content: EducationalContent; index: number } | null>(null);
  const [activeSourceSearch, setActiveSourceSearch] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [isEnrichingEvidence, setIsEnrichingEvidence] = useState(false);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { resetState(initialCase); }, [initialCase, resetState]);
  useEffect(() => {
      const clickOut = (e: MouseEvent) => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setShowExportMenu(false); };
      document.addEventListener('mousedown', clickOut);
      return () => document.removeEventListener('mousedown', clickOut);
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, key: keyof PatientCase) => setPatientCase({ ...patientCase, [key]: e.target.value });
  const handleSave = () => { onSave(patientCase); setIsEditing(false); };
  const handleCancel = () => { resetState(initialCase); setIsEditing(false); };
  const handleCopy = () => { navigator.clipboard.writeText(formatCaseForClipboard(patientCase, T)).then(() => { setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }); };
  const handleImageGenerated = useCallback((idx: number, img: string) => {
    setPatientCase(prev => {
        const edu = [...(prev.educationalContent || [])];
        edu[idx] = { ...edu[idx], imageData: img };
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
    } catch (e) { console.error(e); } finally { setIsEnrichingEvidence(false); }
  };

  const EditableText: React.FC<{ value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; isEditing: boolean; }> = ({ value, onChange, isEditing }) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { if (isEditing && ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${ref.current.scrollHeight}px`; } }, [isEditing, value]);
    return isEditing ? <textarea ref={ref} value={value} onChange={onChange} className="w-full p-2 border border-blue-200 rounded-md focus:ring-2 bg-blue-50/50 text-black resize-none" /> : <MarkdownRenderer content={value} />;
  };
  
  return (
    <div className="p-4 sm:p-6 relative">
      <header className="sticky top-0 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 p-3 sm:p-4 bg-white/80 backdrop-blur-sm border-b border-gray-200 z-10">
        <div className="flex justify-between items-center">
          <h2 className="text-xl sm:text-2xl font-bold text-brand-text truncate pr-2">{patientCase.title}</h2>
          <div className="flex items-center space-x-1">
            {isEditing ? (
              <>
                <button onClick={undo} disabled={!canUndo} className="p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 00-1 1v1.135a4.002 4.002 0 00-2.995 2.562l-1.34-1.34a1 1 0 10-1.414 1.414l1.586 1.586A4.002 4.002 0 008 10a4 4 0 104-4V3a1 1 0 00-1-1zm0 8a2 2 0 100-4 2 2 0 000 4z" /></svg></button>
                <button onClick={redo} disabled={!canRedo} className="p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a1 1 0 001-1v-1.135a4.002 4.002 0 002.995-2.562l1.34 1.34a1 1 0 101.414-1.414l-1.586-1.586A4.002 4.002 0 0012 10a4 4 0 10-4 4V17a1 1 0 001 1zm0-8a2 2 0 100 4 2 2 0 000 4z" /></svg></button>
                <button onClick={handleSave} className="bg-green-600 text-white font-semibold py-1 px-3 rounded-md text-sm">{T.saveButton}</button>
                <button onClick={handleCancel} className="bg-gray-200 text-gray-700 font-semibold py-1 px-3 rounded-md text-sm">{T.cancelButton}</button>
              </>
            ) : (
              <>
                <button onClick={onOpenShare} className="p-2 text-gray-500 hover:bg-gray-100 transition"><svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg></button>
                <button onClick={handleCopy} className="p-2 text-gray-500 hover:bg-gray-100 transition">{isCopied ? <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg> : <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" /></svg>}</button>
                <button onClick={() => setIsEditing(true)} className="p-2 text-gray-500 hover:bg-gray-100 transition"><svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg></button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-4">
        <Section title={T.patientProfile} onCopy={() => handleTextChange} onSaveSnippet={() => onSaveSnippet(T.patientProfile, patientCase.patientProfile)} T={T}>
            <EditableText value={patientCase.patientProfile} onChange={(e) => handleTextChange(e, 'patientProfile')} isEditing={isEditing} />
        </Section>
        <Section title={T.presentingComplaint} onCopy={() => handleTextChange} onSaveSnippet={() => onSaveSnippet(T.presentingComplaint, patientCase.presentingComplaint)} T={T}>
            <EditableText value={patientCase.presentingComplaint} onChange={(e) => handleTextChange(e, 'presentingComplaint')} isEditing={isEditing} />
        </Section>
        <Section title={T.history} onCopy={() => handleTextChange} onSaveSnippet={() => onSaveSnippet(T.history, patientCase.history)} T={T}>
            <EditableText value={patientCase.history} onChange={(e) => handleTextChange(e, 'history')} isEditing={isEditing} />
        </Section>

        { patientCase.biochemicalPathway ? (
            <Section title={T.biochemicalPathwaySection} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(patientCase.biochemicalPathway!.title, patientCase.biochemicalPathway!.description)} T={T}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                        <h4 className="text-md font-semibold text-gray-800">{patientCase.biochemicalPathway.title}</h4>
                        <TextToSpeechPlayer textToRead={`${patientCase.biochemicalPathway.title}. ${patientCase.biochemicalPathway.description}`} language={language} />
                    </div>
                    <button onClick={() => onOpenDiscussion({ aspect: patientCase.biochemicalPathway!.title, consideration: patientCase.biochemicalPathway!.description })} className="text-sm bg-blue-100 hover:bg-blue-200 text-brand-blue font-semibold py-1 px-3 rounded-md transition">{T.discussButton}</button>
                </div>
                <p className="text-xs text-gray-500 italic mb-2">{patientCase.biochemicalPathway.reference}</p>
                <MarkdownRenderer content={patientCase.biochemicalPathway.description} />
                {patientCase.biochemicalPathway.diagramData && <div className="mt-4 h-80 rounded-lg border border-gray-200"><InteractiveDiagram id="diagram-biochem" data={patientCase.biochemicalPathway.diagramData} /></div>}
            </Section>
        ) : isGeneratingDetails ? <Section title={T.biochemicalPathwaySection} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }
        
        { patientCase.multidisciplinaryConnections ? (
            <Section title={T.multidisciplinaryConnections} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.multidisciplinaryConnections, patientCase.multidisciplinaryConnections!.map(c => `${c.discipline}: ${c.connection}`).join('\n'))} T={T}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {patientCase.multidisciplinaryConnections.map((conn, idx) => (
                        <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-4 transition hover:shadow-md hover:border-blue-300 flex flex-col justify-between h-full group">
                            <div>
                                <div className="flex items-center mb-2">
                                    <div className="p-2 rounded-full mr-3" style={{ backgroundColor: `${DisciplineColors[conn.discipline]}20` }}>
                                        <DisciplineIcon discipline={conn.discipline} className="h-5 w-5" style={{ color: DisciplineColors[conn.discipline] }} />
                                    </div>
                                    <h5 className="font-bold text-gray-800">{conn.discipline}</h5>
                                </div>
                                <div className="text-sm text-gray-700 leading-relaxed mb-3">
                                    <MarkdownRenderer content={conn.connection} />
                                </div>
                            </div>
                            <button onClick={() => onOpenDiscussion({ aspect: conn.discipline, consideration: conn.connection })} className="self-end flex items-center space-x-1 text-xs bg-white border border-blue-200 text-brand-blue hover:bg-blue-50 font-semibold py-1.5 px-3 rounded-md transition shadow-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                                <span>{T.discussButton}</span>
                            </button>
                        </div>
                    ))}
                </div>
            </Section>
        ) : isGeneratingDetails ? <Section title={T.multidisciplinaryConnections} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }

        { patientCase.disciplineSpecificConsiderations ? (
            <Section title={T.managementConsiderations} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.managementConsiderations, patientCase.disciplineSpecificConsiderations!.map(c => `${c.aspect}: ${c.consideration}`).join('\n'))} T={T}>
                <ul className="space-y-3">
                    {patientCase.disciplineSpecificConsiderations.map((item, idx) => (
                        <li key={idx}>
                            <div className="flex justify-between items-center">
                                <strong className="text-gray-800">{item.aspect}</strong>
                                <button onClick={() => onOpenDiscussion(item)} className="text-sm bg-blue-100 hover:bg-blue-200 text-brand-blue font-semibold py-1 px-3 rounded-md transition">{T.discussButton}</button>
                            </div>
                            <div className="mt-1"><MarkdownRenderer content={item.consideration} /></div>
                        </li>
                    ))}
                </ul>
            </Section>
        ) : isGeneratingDetails ? <Section title={T.managementConsiderations} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section> : null }

        { (patientCase.traceableEvidence || patientCase.furtherReadings) ? (
            <Section title={T.evidenceAndReading} onCopy={() => {}} onSaveSnippet={() => {}} T={T} onEnrich={handleEnrichSources} isEnriching={isEnrichingEvidence} groundingSources={groundingSources}>
                {patientCase.traceableEvidence && (
                    <div className="mb-4">
                        <h4 className="font-semibold text-gray-800">{T.traceableEvidence}</h4>
                        <ul className="list-disc list-inside space-y-2 mt-2">
                            {patientCase.traceableEvidence.map((e, i) => <li key={i}><span className="font-medium">"{e.claim}"</span> <span className="text-xs ml-1 text-gray-600">(<SourceRenderer text={e.source} onSearchClick={() => setActiveSourceSearch(e.source)} />)</span></li>)}
                        </ul>
                    </div>
                )}
                {patientCase.furtherReadings && (
                    <div>
                        <h4 className="font-semibold text-gray-800">{T.furtherReading}</h4>
                        <ul className="list-disc list-inside space-y-2 mt-2">
                            {patientCase.furtherReadings.map((r, i) => <li key={i}><span className="font-medium">{r.topic}:</span> <span className="text-xs ml-1 text-gray-600"><SourceRenderer text={r.reference} onSearchClick={() => setActiveSourceSearch(r.reference)} /></span></li>)}
                        </ul>
                    </div>
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
