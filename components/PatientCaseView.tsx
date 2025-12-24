
import React, { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { EducationalContentType, Discipline } from '../types';
import type { PatientCase, EducationalContent, QuizQuestion, DisciplineSpecificConsideration, MultidisciplinaryConnection, TraceableEvidence, FurtherReading, ProcedureDetails, PatientOutcome, KnowledgeMapData } from '../types';
import { DisciplineColors } from './KnowledgeMap';
import { QuizView } from './QuizView';
import { ImageGenerator } from './ImageGenerator';
import { TextToSpeechPlayer } from './TextToSpeechPlayer';
import { InteractiveDiagram } from './InteractiveDiagram';
import { SourceSearchModal } from './SourceSearchModal';
import { SmartScanModal } from './SmartScanModal';
// FIX: Removed getConceptAbstract from imports as it is not used in this component.
import { enrichCaseWithWebSources } from '../services/geminiService';
import { DisciplineIcon } from './DisciplineIcon';
import { MarkdownRenderer } from './MarkdownRenderer';
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
            if (JSON.stringify(newState) === JSON.stringify(state.history[state.currentIndex])) {
                return state;
            }
            const newHistory = state.history.slice(0, state.currentIndex + 1);
            newHistory.push(newState);
            return {
                history: newHistory,
                currentIndex: newHistory.length - 1,
            };
        }
        case 'UNDO': {
            const newIndex = Math.max(0, state.currentIndex - 1);
            return { ...state, currentIndex: newIndex };
        }
        case 'REDO': {
            const newIndex = Math.min(state.history.length - 1, state.currentIndex + 1);
            return { ...state, currentIndex: newIndex };
        }
        case 'RESET_STATE': {
            return {
                history: [action.payload.initialState],
                currentIndex: 0,
            };
        }
        default:
            return state;
    }
}

function useHistoryState<T>(initialState: T) {
  const [state, dispatch] = useReducer(historyReducer, {
    history: [initialState],
    currentIndex: 0,
  });

  const { history, currentIndex } = state;
  const currentState = history[currentIndex];

  const setState = useCallback((newState: T | ((prevState: T) => T)) => {
    const value = typeof newState === 'function'
      ? (newState as (prevState: T) => T)(currentState)
      : newState;
    dispatch({ type: 'SET_STATE', payload: { newState: value } });
  }, [currentState]);

  const undo = useCallback(() => dispatch({ type: 'UNDO', payload: {} }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO', payload: {} }), []);
  const resetState = useCallback((newState: T) => dispatch({ type: 'RESET_STATE', payload: { initialState: newState } }), []);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  return { state: currentState, setState, undo, redo, canUndo, canRedo, resetState };
}

const Section: React.FC<{
  title: string;
  onCopy: () => void;
  onSaveSnippet: () => void;
  T: Record<string, any>;
  onEnrich?: () => void;
  isEnriching?: boolean;
  groundingSources?: any[];
  onSourceClick?: (source: string) => void;
  children: React.ReactNode;
}> = ({ title, onCopy, onSaveSnippet, onEnrich, isEnriching, groundingSources, onSourceClick, children, T }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isSnippetSaved, setIsSnippetSaved] = useState(false);
  
  const handleCopy = () => {
    onCopy();
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  const handleSaveSnippet = () => {
      onSaveSnippet();
      setIsSnippetSaved(true);
      setTimeout(() => setIsSnippetSaved(false), 2000);
  };
  
  return (
    <section className="mt-4">
      <div className="flex items-center justify-between mb-2 pb-1 border-b-2 border-brand-blue/30">
        <h3 className="text-lg font-bold text-brand-blue">{title}</h3>
        <div className="flex items-center space-x-2">
            {onEnrich && (
                <button
                    onClick={onEnrich}
                    disabled={isEnriching}
                    title={T.enrichButton}
                    className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition disabled:cursor-not-allowed"
                >
                    {isEnriching ? (
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3.5a1.5 1.5 0 011.5 1.5v2.086l2.723-2.723a.75.75 0 111.06 1.06L12.564 8.15l2.724 2.724a.75.75 0 11-1.06 1.06L11.5 9.22v2.085a1.5 1.5 0 01-3 0V9.22l-2.724 2.724a.75.75 0 11-1.06-1.06L7.436 8.15 4.712 5.426a.75.75 0 111.06-1.06L8.5 7.085V5A1.5 1.5 0 0110 3.5z" /><path d="M10 12.5a.5.5 0 01.5.5v2.086l2.723-2.723a.75.75 0 111.06 1.06L11.564 16.15l2.724 2.724a.75.75 0 11-1.06 1.06L10.5 17.22v2.085a.5.5 0 01-1 0v-2.085l-2.724 2.724a.75.75 0 11-1.06-1.06L7.436 16.15 4.712 13.426a.75.75 0 111.06-1.06L8.5 15.085V13a.5.5 0 01.5-.5z" /></svg>
                    )}
                </button>
            )}
           <button
              onClick={handleSaveSnippet}
              title={isSnippetSaved ? T.snippetSavedButton : T.saveSnippetButton}
              className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition"
            >
              {isSnippetSaved ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v12a1 1 0 01-1.447.894L10 14.586l-3.553 2.308A1 1 0 015 16V4z" /></svg>
              )}
            </button>
          <button onClick={handleCopy} title={T.copySectionButton} className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
            {isCopied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" /></svg>
            )}
          </button>
        </div>
      </div>
      <div className="text-sm text-brand-text space-y-2">{children}</div>
    </section>
  );
};

export const PatientCaseView: React.FC<PatientCaseViewProps> = ({ patientCase: initialPatientCase, isGeneratingDetails, onSave, language, T, onSaveSnippet, onOpenShare, onOpenDiscussion, onGetMapImage, mapData }) => {
  const { state: patientCase, setState: setPatientCase, undo, redo, canUndo, canRedo, resetState } = useHistoryState<PatientCase>(initialPatientCase);
  const [isEditing, setIsEditing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [activeImageGenerator, setActiveImageGenerator] = useState<{ content: EducationalContent; index: number } | null>(null);
  const [activeSourceSearch, setActiveSourceSearch] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  
  const [isEnrichingEvidence, setIsEnrichingEvidence] = useState(false);
  const [isSmartScanOpen, setIsSmartScanOpen] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resetState(initialPatientCase);
  }, [initialPatientCase, resetState]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, key: keyof PatientCase) => {
    setPatientCase({ ...patientCase, [key]: e.target.value });
  };
  
  const handleSave = () => {
    onSave(patientCase);
    setIsEditing(false);
  };
  
  const handleCancel = () => {
    resetState(initialPatientCase);
    setIsEditing(false);
  };

  const handleSmartScanData = (extractedText: string) => {
      // Append to history as a new sub-section
      setPatientCase(prev => ({
          ...prev,
          history: `${prev.history}\n\n### Scanned Clinical Data\n${extractedText}`
      }));
      // Also potentially add a management consideration if blood tests are detected
      if (extractedText.toLowerCase().includes('blood') || extractedText.toLowerCase().includes('test')) {
          setPatientCase(prev => ({
              ...prev,
              disciplineSpecificConsiderations: [
                  ...(prev.disciplineSpecificConsiderations || []),
                  { aspect: 'Lab Result Interpretation', consideration: `Reviewing recent clinical data: ${extractedText.substring(0, 100)}...` }
              ]
          }));
      }
  };

  const EditableText: React.FC<{ value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; isEditing: boolean; }> = ({ value, onChange, isEditing }) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [isEditing, value]);

    return isEditing ? (
        <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            className="w-full p-3 border-2 border-brand-blue/30 rounded-xl focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition bg-blue-50/30 text-black resize-none text-base sm:text-sm font-medium leading-relaxed"
        />
    ) : (
        <MarkdownRenderer content={value} />
    );
  };
  
  return (
    <div className="p-4 sm:p-6 relative">
      <header className="sticky top-0 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 p-3 sm:p-4 bg-white/90 backdrop-blur-md border-b border-gray-200 z-20 shadow-sm">
        <div className="flex justify-between items-center">
          <h2 className="text-xl sm:text-2xl font-bold text-brand-text truncate pr-2">{patientCase.title}</h2>
          <div className="flex items-center space-x-1 sm:space-x-2">
            {isEditing ? (
              <>
                <button onClick={undo} disabled={!canUndo} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 disabled:text-gray-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 00-1 1v1.135a4.002 4.002 0 00-2.995 2.562l-1.34-1.34a1 1 0 10-1.414 1.414l1.586 1.586A4.002 4.002 0 008 10a4 4 0 104-4V3a1 1 0 00-1-1zm0 8a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /><path d="M4.343 5.757a1 1 0 001.414-1.414L4.94 3.525A8.001 8.001 0 0010 2a8 8 0 100 16 8 8 0 008-8h-2c0 3.314-2.686 6-6 6S4 13.314 4 10c0-.212.01-.422.029-.631l.314.314z" /></svg>
                </button>
                <button onClick={redo} disabled={!canRedo} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 disabled:text-gray-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a1 1 0 001-1v-1.135a4.002 4.002 0 002.995-2.562l1.34 1.34a1 1 0 101.414-1.414l-1.586-1.586A4.002 4.002 0 0012 10a4 4 0 10-4 4V17a1 1 0 001 1zm0-8a2 2 0 100 4 2 2 0 000 4z" clipRule="evenodd" /><path d="M15.657 14.243a1 1 0 00-1.414 1.414l.817.817a8.001 8.001 0 00-5.06-14.475V2a8 8 0 100 16c.212 0 .422-.01.631-.029l-.314-.314z" /></svg>
                </button>
                <button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-4 rounded-lg transition text-sm">Save</button>
                <button onClick={handleCancel} className="bg-gray-200 text-gray-700 font-bold py-1.5 px-4 rounded-lg transition text-sm">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setIsSmartScanOpen(true)} className="flex items-center space-x-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold py-1.5 px-3 rounded-lg border border-indigo-200 transition text-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span className="hidden sm:inline">Smart Scan</span>
                </button>
                <button onClick={() => setIsEditing(true)} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-6 pb-20">
        <Section title={T.patientProfile} onCopy={() => {}} onSaveSnippet={() => {}} T={T}>
            <EditableText value={patientCase.patientProfile} onChange={(e) => handleTextChange(e, 'patientProfile')} isEditing={isEditing} />
        </Section>
        <Section title={T.presentingComplaint} onCopy={() => {}} onSaveSnippet={() => {}} T={T}>
            <EditableText value={patientCase.presentingComplaint} onChange={(e) => handleTextChange(e, 'presentingComplaint')} isEditing={isEditing} />
        </Section>
        <Section title={T.history} onCopy={() => {}} onSaveSnippet={() => {}} T={T}>
            <EditableText value={patientCase.history} onChange={(e) => handleTextChange(e, 'history')} isEditing={isEditing} />
        </Section>

        {/* Floating action button for mobile scanning when editing */}
        {isEditing && (
            <button 
                onClick={() => setIsSmartScanOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center z-50 hover:scale-110 active:scale-95 transition-transform"
                title="Scan document to case"
            >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
        )}

        {/* ... Rest of existing UI sections ... */}
        {patientCase.biochemicalPathway && (
            <Section title={T.biochemicalPathwaySection} onCopy={() => {}} onSaveSnippet={() => {}} T={T}>
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-md font-semibold text-gray-800">{patientCase.biochemicalPathway.title}</h4>
                    <button onClick={() => onOpenDiscussion({ aspect: patientCase.biochemicalPathway!.title, consideration: patientCase.biochemicalPathway!.description })} className="text-xs bg-blue-50 text-brand-blue py-1 px-3 rounded-md border border-blue-100">Discuss</button>
                </div>
                <MarkdownRenderer content={patientCase.biochemicalPathway.description} />
            </Section>
        )}
      </div>

      <SmartScanModal
          isOpen={isSmartScanOpen}
          onClose={() => setIsSmartScanOpen(false)}
          onDataExtracted={handleSmartScanData}
          language={language}
          T={T}
      />
      
      {/* ... Existing Modals ... */}
    </div>
  );
};
