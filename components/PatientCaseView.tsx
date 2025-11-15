import React, { useState, useEffect, useCallback, useReducer } from 'react';
import { EducationalContentType, Discipline } from '../types';
import type { PatientCase, EducationalContent, QuizQuestion, DisciplineSpecificConsideration, MultidisciplinaryConnection, TraceableEvidence, FurtherReading, ProcedureDetails, PatientOutcome } from '../types';
import { DisciplineColors } from './KnowledgeMap';
import { QuizView } from './QuizView';
import { ImageGenerator } from './ImageGenerator';
import { TextToSpeechPlayer } from './TextToSpeechPlayer';
import { DiscussionModal } from './DiscussionModal';
import { InteractiveDiagram } from './InteractiveDiagram';
import { SourceSearchModal } from './SourceSearchModal';
import { enrichCaseWithWebSources } from '../services/geminiService';

declare const jspdf: any;

interface PatientCaseViewProps {
  patientCase: PatientCase;
  onSave: (updatedCase: PatientCase) => void;
  language: string;
  T: Record<string, any>;
  onSaveSnippet: (title: string, content: string) => void;
  onOpenShare: () => void;
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

// A custom hook to manage state history for undo/redo, using useReducer for robust state management.
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


const formatCaseForClipboard = (patientCase: PatientCase, T: Record<string, any>): string => {
    let text = `Title: ${patientCase.title}\n\n`;

    text += `## ${T.patientProfile}\n`;
    text += `${patientCase.patientProfile}\n\n`;

    text += `## ${T.presentingComplaint}\n`;
    text += `${patientCase.presentingComplaint}\n\n`;

    text += `## ${T.history}\n`;
    text += `${patientCase.history}\n\n`;

    if (patientCase.procedureDetails) {
        text += `## ${T.anestheticDataSection}\n`;
        text += `- **${T.procedureLabel}:** ${patientCase.procedureDetails.procedureName}\n`;
        text += `- **${T.asaScoreLabel}:** ${patientCase.procedureDetails.asaScore}\n\n`;
    }

    if (patientCase.outcomes) {
        text += `## ${T.outcomesSection}\n`;
        text += `- **${T.icuAdmissionLabel}:** ${patientCase.outcomes.icuAdmission ? 'Yes' : 'No'}\n`;
        text += `- **${T.lengthOfStayLabel}:** ${patientCase.outcomes.lengthOfStayDays} days\n`;
        text += `- **${T.outcomeSummaryLabel}:** ${patientCase.outcomes.outcomeSummary}\n\n`;
    }

    if (patientCase.biochemicalPathway) {
        text += `## ${T.biochemicalPathwaySection}\n`;
        text += `### ${patientCase.biochemicalPathway.title} (${patientCase.biochemicalPathway.type})\n`;
        text += `${patientCase.biochemicalPathway.description}\n`;
        text += `Reference: ${patientCase.biochemicalPathway.reference}\n\n`;
    }

    text += `## ${T.multidisciplinaryConnections}\n`;
    patientCase.multidisciplinaryConnections.forEach(conn => {
        text += `- **${conn.discipline}:** ${conn.connection}\n`;
    });
    text += '\n';

    if (patientCase.disciplineSpecificConsiderations?.length > 0) {
        text += `## ${T.managementConsiderations}\n`;
        patientCase.disciplineSpecificConsiderations.forEach(item => {
            text += `- **${item.aspect}:** ${item.consideration}\n`;
        });
        text += '\n';
    }

    if (patientCase.educationalContent?.length > 0) {
        text += `## ${T.educationalContent}\n`;
        patientCase.educationalContent.forEach(item => {
            text += `### ${item.title} (${item.type})\n`;
            text += `${item.description}\n`;
            text += `Reference: ${item.reference}\n\n`;
        });
    }

    if (patientCase.traceableEvidence?.length > 0) {
        text += `## ${T.traceableEvidence}\n`;
        patientCase.traceableEvidence.forEach(item => {
            text += `- **Claim:** "${item.claim}"\n`;
            text += `  **Source:** ${item.source}\n`;
        });
        text += '\n';
    }
    
    if (patientCase.furtherReadings?.length > 0) {
        text += `## ${T.furtherReading}\n`;
        patientCase.furtherReadings.forEach(item => {
            text += `- **${item.topic}:** ${item.reference}\n`;
        });
        text += '\n';
    }

    if (patientCase.quiz?.length > 0) {
        text += `## ${T.quizTitle}\n`;
        patientCase.quiz.forEach((q, i) => {
            text += `${i + 1}. ${q.question}\n`;
            q.options.forEach((opt, oIndex) => {
                text += `   ${String.fromCharCode(65 + oIndex)}. ${opt}\n`;
            });
            text += `   **Answer:** ${q.options[q.correctAnswerIndex]}\n`;
            text += `   **Explanation:** ${q.explanation}\n\n`;
        });
    }

    return text;
};

// Fix: Add T to Section component props to resolve scope issues.
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
      {groundingSources && groundingSources.length > 0 && (
          <div className="mt-3 p-2 bg-gray-100 border border-gray-200 rounded-md">
              <p className="text-xs font-semibold text-gray-600">{T.groundingSourcesTitle}</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                  {groundingSources.map((source, index) => source.web?.uri ? (
                       <li key={index} className="text-xs">
                           <a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                               {source.web.title || source.web.uri}
                           </a>
                       </li>
                  ) : null)}
              </ul>
          </div>
      )}
    </section>
  );
};

export const PatientCaseView: React.FC<PatientCaseViewProps> = ({ patientCase: initialPatientCase, onSave, language, T, onSaveSnippet, onOpenShare }) => {
  const { state: patientCase, setState: setPatientCase, undo, redo, canUndo, canRedo, resetState } = useHistoryState<PatientCase>(initialPatientCase);
  const [isEditing, setIsEditing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [activeImageGenerator, setActiveImageGenerator] = useState<EducationalContent | null>(null);
  const [activeDiscussion, setActiveDiscussion] = useState<DisciplineSpecificConsideration | null>(null);
  const [activeSourceSearch, setActiveSourceSearch] = useState<string | null>(null);
  
  const [isEnrichingEvidence, setIsEnrichingEvidence] = useState(false);
  const [evidenceSources, setEvidenceSources] = useState<any[]>([]);
  const [readingSources, setReadingSources] = useState<any[]>([]);

  useEffect(() => {
    resetState(initialPatientCase);
  }, [initialPatientCase, resetState]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, key: keyof PatientCase) => {
    setPatientCase({ ...patientCase, [key]: e.target.value });
  };
  
  const handleArrayChange = (e: React.ChangeEvent<HTMLTextAreaElement>, index: number, key: keyof PatientCase, field: string) => {
    const newArray = [...(patientCase[key] as any[])];
    newArray[index] = { ...newArray[index], [field]: e.target.value };
    setPatientCase({ ...patientCase, [key]: newArray });
  };

  const handleAddItem = (key: keyof PatientCase) => {
      let newItem;
      if (key === 'multidisciplinaryConnections') {
          newItem = { discipline: Discipline.PHYSIOLOGY, connection: '' };
      } else if (key === 'disciplineSpecificConsiderations') {
          newItem = { aspect: '', consideration: '' };
      } else if (key === 'traceableEvidence') {
          newItem = { claim: '', source: '' };
      } else if (key === 'furtherReadings') {
          newItem = { topic: '', reference: '' };
      } else {
          return;
      }
      const newArray = [...(patientCase[key] as any[]), newItem];
      setPatientCase({ ...patientCase, [key]: newArray });
  };
  
  const handleDeleteItem = (key: keyof PatientCase, index: number) => {
      const newArray = (patientCase[key] as any[]).filter((_, i) => i !== index);
      setPatientCase({ ...patientCase, [key]: newArray });
  };
  
  const handleSave = () => {
    onSave(patientCase);
    setIsEditing(false);
  };
  
  const handleCancel = () => {
    resetState(initialPatientCase);
    setIsEditing(false);
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(formatCaseForClipboard(patientCase, T)).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    });
  };
  
  const handleCopySection = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleEnrichSources = async () => {
    setIsEnrichingEvidence(true);
    setEvidenceSources([]);
    setReadingSources([]);

    try {
        const { newEvidence, newReadings, groundingSources } = await enrichCaseWithWebSources(patientCase, language);
        if (newEvidence.length > 0 || newReadings.length > 0) {
            setPatientCase(prevCase => ({
                ...prevCase,
                traceableEvidence: [...prevCase.traceableEvidence, ...newEvidence],
                furtherReadings: [...prevCase.furtherReadings, ...newReadings],
            }));
            
            // Separate sources for each section
            setEvidenceSources(groundingSources);
            setReadingSources(groundingSources);
        }
    } catch (error) {
        console.error("Failed to enrich case:", error);
    } finally {
        setIsEnrichingEvidence(false);
    }
  };
  
  const handleDownloadPdf = () => {
    if (!patientCase) return;

    const { jsPDF } = jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = doc.internal.pageSize.getWidth() - margin * 2;
    let y = margin;

    const checkPageBreak = (heightNeeded: number = 10) => {
        if (y + heightNeeded > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
    };

    const addTitle = (text: string) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        const splitText = doc.splitTextToSize(text, contentWidth);
        checkPageBreak(splitText.length * 10);
        doc.text(splitText, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
        y += (splitText.length * 10) + 5;
    };

    const addHeading = (text: string) => {
        checkPageBreak(15);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(text, margin, y);
        y += 8;
        doc.setLineWidth(0.5);
        doc.line(margin, y - 2, doc.internal.pageSize.getWidth() - margin, y - 2);
    };

    const addSubheading = (text: string) => {
        checkPageBreak(12);
        y += 3;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(text, margin, y);
        y += 6;
    };

    const addText = (text: string, options: { indent?: number } = {}) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const indent = options.indent || 0;
        const splitText = doc.splitTextToSize(text, contentWidth - indent);
        checkPageBreak(splitText.length * 5);
        doc.text(splitText, margin + indent, y);
        y += splitText.length * 5 + 3;
    };

    const addListItem = (label: string, value: string) => {
        if (!value) return;
        const fullText = `${label}: ${value}`;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        const splitText = doc.splitTextToSize(fullText, contentWidth);
        checkPageBreak(splitText.length * 5 + 2);

        doc.setFont('helvetica', 'bold');
        doc.text(`${label}: `, margin, y, { maxWidth: contentWidth });
        const labelWidth = doc.getTextWidth(`${label}: `);

        doc.setFont('helvetica', 'normal');
        doc.text(value, margin + labelWidth, y, { maxWidth: contentWidth - labelWidth });

        y += splitText.length * 5 + 2;
    };
    
    // Document Generation
    addTitle(patientCase.title);
    addHeading(T.patientProfile);
    addText(patientCase.patientProfile);
    addHeading(T.presentingComplaint);
    addText(patientCase.presentingComplaint);
    addHeading(T.history);
    addText(patientCase.history);

    if (patientCase.procedureDetails) {
        addHeading(T.anestheticDataSection);
        addListItem(T.procedureLabel, patientCase.procedureDetails.procedureName);
        addListItem(T.asaScoreLabel, patientCase.procedureDetails.asaScore);
    }
    
    if (patientCase.outcomes) {
        addHeading(T.outcomesSection);
        addListItem(T.icuAdmissionLabel, patientCase.outcomes.icuAdmission ? 'Yes' : 'No');
        addListItem(T.lengthOfStayLabel, `${patientCase.outcomes.lengthOfStayDays} days`);
        addListItem(T.outcomeSummaryLabel, patientCase.outcomes.outcomeSummary);
    }
    
    if (patientCase.biochemicalPathway) {
        addHeading(T.biochemicalPathwaySection);
        addSubheading(`${patientCase.biochemicalPathway.title} (${patientCase.biochemicalPathway.type})`);
        addText(patientCase.biochemicalPathway.description);
        addListItem("Reference", patientCase.biochemicalPathway.reference);
    }
    
    addHeading(T.multidisciplinaryConnections);
    patientCase.multidisciplinaryConnections.forEach(conn => addListItem(conn.discipline, conn.connection));

    if (patientCase.disciplineSpecificConsiderations?.length > 0) {
        addHeading(T.managementConsiderations);
        patientCase.disciplineSpecificConsiderations.forEach(item => addListItem(item.aspect, item.consideration));
    }
    
    if (patientCase.educationalContent?.length > 0) {
        addHeading(T.educationalContent);
        patientCase.educationalContent.forEach(item => {
            addSubheading(`${item.title} (${item.type})`);
            addText(item.description);
            addListItem("Reference", item.reference);
            y += 4;
        });
    }

    if (patientCase.traceableEvidence?.length > 0) {
        addHeading(T.traceableEvidence);
        patientCase.traceableEvidence.forEach(item => {
            addListItem("Claim", `"${item.claim}"`);
            addListItem("Source", item.source);
            y += 4;
        });
    }

    if (patientCase.furtherReadings?.length > 0) {
        addHeading(T.furtherReading);
        patientCase.furtherReadings.forEach(item => addListItem(item.topic, item.reference));
    }

    if (patientCase.quiz?.length > 0) {
        addHeading(T.quizTitle);
        patientCase.quiz.forEach((q, i) => {
            checkPageBreak(50); // Estimate space for a full quiz question
            addText(`${i + 1}. ${q.question}`);
            q.options.forEach((opt, oIndex) => addText(`${String.fromCharCode(65 + oIndex)}. ${opt}`, { indent: 5 }));
            addText(`${T.quizExplanation}: ${q.explanation}`, { indent: 5 });
            y += 5;
        });
    }

    doc.save(`${patientCase.title.replace(/\s+/g, '_')}.pdf`);
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
            className="w-full p-2 border border-blue-200 rounded-md focus:ring-2 focus:ring-brand-blue-light transition bg-blue-50/50 text-black resize-none"
        />
    ) : <p className="whitespace-pre-wrap">{value}</p>;
  };
  
  return (
    <div className="p-4 sm:p-6 relative">
      <header className="sticky top-0 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 p-3 sm:p-4 bg-white/80 backdrop-blur-sm border-b border-gray-200 z-10">
        <div className="flex justify-between items-center">
          <h2 className="text-xl sm:text-2xl font-bold text-brand-text truncate pr-2">{patientCase.title}</h2>
          <div className="flex items-center space-x-1">
            {!isEditing && (
              <>
                 <button onClick={handleDownloadPdf} title={T.downloadPdfButton} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
                <button onClick={onOpenShare} title={T.shareButtonTitle} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>
                </button>
                <button onClick={handleCopy} title={T.copyCaseButton} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
                  {isCopied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" /><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" /></svg>
                  )}
                </button>
                <button onClick={() => setIsEditing(true)} title={T.editButton} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                </button>
              </>
            )}
            {isEditing && (
              <>
                <button onClick={undo} disabled={!canUndo} title={T.undoButton} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition disabled:text-gray-300 disabled:cursor-not-allowed">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </button>
                <button onClick={redo} disabled={!canRedo} title={T.redoButton} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition disabled:text-gray-300 disabled:cursor-not-allowed">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.293 3.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 9H9a5 5 0 00-5 5v2a1 1 0 11-2 0v-2a7 7 0 017-7h5.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                <button onClick={handleCancel} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1.5 px-3 rounded-md transition text-sm">{T.cancelButton}</button>
                <button onClick={handleSave} className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-1.5 px-3 rounded-md transition text-sm">{T.saveButton}</button>
              </>
            )}
          </div>
        </div>
      </header>
      
      <Section T={T} title={T.patientProfile} onCopy={() => handleCopySection(patientCase.patientProfile)} onSaveSnippet={() => onSaveSnippet(T.patientProfile, patientCase.patientProfile)}>
        <EditableText value={patientCase.patientProfile} onChange={(e) => handleTextChange(e, 'patientProfile')} isEditing={isEditing} />
      </Section>
      
      <Section T={T} title={T.presentingComplaint} onCopy={() => handleCopySection(patientCase.presentingComplaint)} onSaveSnippet={() => onSaveSnippet(T.presentingComplaint, patientCase.presentingComplaint)}>
        <EditableText value={patientCase.presentingComplaint} onChange={(e) => handleTextChange(e, 'presentingComplaint')} isEditing={isEditing} />
      </Section>
      
      <Section T={T} title={T.history} onCopy={() => handleCopySection(patientCase.history)} onSaveSnippet={() => onSaveSnippet(T.history, patientCase.history)}>
         <div className="flex items-center space-x-2">
            <EditableText value={patientCase.history} onChange={(e) => handleTextChange(e, 'history')} isEditing={isEditing} />
            <TextToSpeechPlayer textToRead={patientCase.history} language={language} />
        </div>
      </Section>

      {patientCase.procedureDetails && (
          <Section T={T} title={T.anestheticDataSection} onCopy={() => handleCopySection(JSON.stringify(patientCase.procedureDetails))} onSaveSnippet={() => onSaveSnippet(T.anestheticDataSection, JSON.stringify(patientCase.procedureDetails))}>
              <div className="bg-gray-50 p-3 rounded-md border border-gray-200 space-y-2">
                <div>
                    <p className="font-semibold text-xs text-gray-500 uppercase">{T.procedureLabel}</p>
                    <p>{patientCase.procedureDetails.procedureName}</p>
                </div>
                 <div>
                    <p className="font-semibold text-xs text-gray-500 uppercase">{T.asaScoreLabel}</p>
                    <p>{patientCase.procedureDetails.asaScore}</p>
                </div>
              </div>
          </Section>
      )}

      {patientCase.outcomes && (
           <Section T={T} title={T.outcomesSection} onCopy={() => handleCopySection(JSON.stringify(patientCase.outcomes))} onSaveSnippet={() => onSaveSnippet(T.outcomesSection, JSON.stringify(patientCase.outcomes))}>
               <div className="bg-gray-50 p-3 rounded-md border border-gray-200 grid grid-cols-2 sm:grid-cols-3 gap-4">
                 <div>
                    <p className="font-semibold text-xs text-gray-500 uppercase">{T.icuAdmissionLabel}</p>
                    <p>{patientCase.outcomes.icuAdmission ? T.yes : T.no}</p>
                </div>
                <div>
                    <p className="font-semibold text-xs text-gray-500 uppercase">{T.lengthOfStayLabel}</p>
                    <p>{patientCase.outcomes.lengthOfStayDays} {T.days}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                    <p className="font-semibold text-xs text-gray-500 uppercase">{T.outcomeSummaryLabel}</p>
                    <p>{patientCase.outcomes.outcomeSummary}</p>
                </div>
               </div>
           </Section>
      )}

      <Section T={T} title={T.biochemicalPathwaySection} onCopy={() => handleCopySection(`${patientCase.biochemicalPathway.title}\n${patientCase.biochemicalPathway.description}`)} onSaveSnippet={() => onSaveSnippet(patientCase.biochemicalPathway.title, patientCase.biochemicalPathway.description)}>
        <EducationalContentView content={patientCase.biochemicalPathway} onGenerateImage={setActiveImageGenerator} />
      </Section>
      
      <Section T={T} title={T.multidisciplinaryConnections} onCopy={() => handleCopySection(patientCase.multidisciplinaryConnections.map(c => `${c.discipline}: ${c.connection}`).join('\n'))} onSaveSnippet={() => onSaveSnippet(T.multidisciplinaryConnections, patientCase.multidisciplinaryConnections.map(c => `${c.discipline}: ${c.connection}`).join('\n'))}>
        <div className="space-y-4">
            {patientCase.multidisciplinaryConnections.map((conn, index) => (
                <div key={index} className="flex gap-2">
                    <div className="bg-gray-50 p-3 rounded-md border border-gray-200 flex-grow">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${DisciplineColors[conn.discipline]}20`, color: DisciplineColors[conn.discipline] }}>{conn.discipline}</span>
                        <EditableText value={conn.connection} onChange={(e) => handleArrayChange(e, index, 'multidisciplinaryConnections', 'connection')} isEditing={isEditing} />
                    </div>
                    {isEditing && (
                        <button onClick={() => handleDeleteItem('multidisciplinaryConnections', index)} title={T.deleteButtonTitle} className="p-2 h-10 self-center text-red-500 hover:bg-red-100 rounded-full transition">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        </button>
                    )}
                </div>
            ))}
             {isEditing && <button onClick={() => handleAddItem('multidisciplinaryConnections')} className="text-sm text-brand-blue font-semibold hover:underline">{T.addButton}</button>}
        </div>
      </Section>

       {patientCase.disciplineSpecificConsiderations?.length > 0 && (
          <Section T={T} title={T.managementConsiderations} onCopy={() => handleCopySection(patientCase.disciplineSpecificConsiderations.map(c => `${c.aspect}: ${c.consideration}`).join('\n'))} onSaveSnippet={() => onSaveSnippet(T.managementConsiderations, patientCase.disciplineSpecificConsiderations.map(c => `${c.aspect}: ${c.consideration}`).join('\n'))}>
              <div className="space-y-4">
                  {patientCase.disciplineSpecificConsiderations.map((item, index) => (
                      <div key={index} className="flex gap-2">
                          <div className="bg-gray-50 p-3 rounded-md border border-gray-200 flex-grow">
                              <div className="flex justify-between items-start">
                                  <EditableText value={item.aspect} onChange={(e) => handleArrayChange(e, index, 'disciplineSpecificConsiderations', 'aspect')} isEditing={isEditing} />
                                  {!isEditing && (
                                     <button onClick={() => setActiveDiscussion(item)} title={T.discussButton} className="ml-2 -mt-1 -mr-1 p-1.5 rounded-full text-gray-400 hover:bg-blue-100 hover:text-brand-blue transition">
                                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.832 8.832 0 01-4.323-.972l-3.35 1.116a.5.5 0 01-.63-.63l1.116-3.35A8.832 8.832 0 012 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM4.445 13.046a.5.5 0 01.373.636l-.743 2.228 2.228-.743a.5.5 0 01.636.373A6.96 6.96 0 0010 16a6 6 0 100-12 6.96 6.96 0 00-2.932.652.5.5 0 01-.636.373l-2.228-.743.743 2.228a.5.5 0 01-.373.636A6.968 6.968 0 004 10a6.968 6.968 0 00.445 3.046z" clipRule="evenodd" /></svg>
                                     </button>
                                  )}
                              </div>
                              <EditableText value={item.consideration} onChange={(e) => handleArrayChange(e, index, 'disciplineSpecificConsiderations', 'consideration')} isEditing={isEditing} />
                          </div>
                           {isEditing && (
                              <button onClick={() => handleDeleteItem('disciplineSpecificConsiderations', index)} title={T.deleteButtonTitle} className="p-2 h-10 self-center text-red-500 hover:bg-red-100 rounded-full transition"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button>
                           )}
                      </div>
                  ))}
                  {isEditing && <button onClick={() => handleAddItem('disciplineSpecificConsiderations')} className="text-sm text-brand-blue font-semibold hover:underline">{T.addButton}</button>}
              </div>
          </Section>
      )}

      <Section T={T} title={T.educationalContent} onCopy={() => handleCopySection(patientCase.educationalContent.map(c => `${c.title}\n${c.description}`).join('\n\n'))} onSaveSnippet={() => onSaveSnippet(T.educationalContent, patientCase.educationalContent.map(c => `${c.title}\n${c.description}`).join('\n\n'))}>
        <div className="space-y-4">
            {patientCase.educationalContent.map((item, index) => <EducationalContentView key={index} content={item} onGenerateImage={setActiveImageGenerator} />)}
        </div>
      </Section>
      
      <Section T={T} title={T.traceableEvidence} onCopy={() => handleCopySection(patientCase.traceableEvidence.map(e => `Claim: ${e.claim}\nSource: ${e.source}`).join('\n\n'))} onSaveSnippet={() => onSaveSnippet(T.traceableEvidence, patientCase.traceableEvidence.map(e => `Claim: ${e.claim}\nSource: ${e.source}`).join('\n\n'))} onEnrich={handleEnrichSources} isEnriching={isEnrichingEvidence} groundingSources={evidenceSources}>
          {patientCase.traceableEvidence.map((item, index) => (
             <div key={index} className="flex gap-2">
                 <div className="bg-gray-50 p-3 rounded-md border border-gray-200 flex-grow">
                     <EditableText value={item.claim} onChange={(e) => handleArrayChange(e, index, 'traceableEvidence', 'claim')} isEditing={isEditing} />
                     <div className="flex items-center">
                        <p className="text-xs text-gray-500 mt-1 italic flex-grow">Source: {item.source}</p>
                        <button onClick={() => setActiveSourceSearch(item.source)} className="ml-2 text-xs text-blue-600 hover:underline">Verify</button>
                     </div>
                 </div>
                 {isEditing && (<button onClick={() => handleDeleteItem('traceableEvidence', index)} title={T.deleteButtonTitle} className="p-2 h-10 self-center text-red-500 hover:bg-red-100 rounded-full transition"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button>)}
             </div>
          ))}
          {isEditing && <button onClick={() => handleAddItem('traceableEvidence')} className="text-sm text-brand-blue font-semibold hover:underline mt-2">{T.addButton}</button>}
      </Section>
      
      <Section T={T} title={T.furtherReading} onCopy={() => handleCopySection(patientCase.furtherReadings.map(r => `${r.topic}: ${r.reference}`).join('\n'))} onSaveSnippet={() => onSaveSnippet(T.furtherReading, patientCase.furtherReadings.map(r => `${r.topic}: ${r.reference}`).join('\n'))} groundingSources={readingSources}>
          <ul className="list-disc list-inside space-y-2">
              {patientCase.furtherReadings.map((item, index) => (
                   <li key={index} className="flex gap-2 items-start">
                       <div className="flex-grow">
                           <span className="font-semibold">{item.topic}:</span> {item.reference}
                       </div>
                       {isEditing && (<button onClick={() => handleDeleteItem('furtherReadings', index)} title={T.deleteButtonTitle} className="p-1 text-red-500 hover:bg-red-100 rounded-full transition"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button>)}
                   </li>
              ))}
          </ul>
           {isEditing && <button onClick={() => handleAddItem('furtherReadings')} className="text-sm text-brand-blue font-semibold hover:underline mt-2">{T.addButton}</button>}
      </Section>
      
      <QuizView quiz={patientCase.quiz} T={T} />

       {activeImageGenerator && <ImageGenerator content={activeImageGenerator} onClose={() => setActiveImageGenerator(null)} language={language} T={T} />}
       {activeDiscussion && <DiscussionModal isOpen={!!activeDiscussion} onClose={() => setActiveDiscussion(null)} topic={activeDiscussion} caseTitle={patientCase.title} language={language} T={T} />}
       {activeSourceSearch && <SourceSearchModal isOpen={!!activeSourceSearch} onClose={() => setActiveSourceSearch(null)} sourceQuery={activeSourceSearch} language={language} T={T} />}
    </div>
  );
};

const EducationalContentView: React.FC<{ content: EducationalContent, onGenerateImage: (content: EducationalContent) => void }> = ({ content, onGenerateImage }) => {
    return (
        <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
            <div className="flex justify-between items-center">
                <h4 className="font-semibold text-gray-800">{content.title}</h4>
                <span className="text-xs font-medium bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{content.type}</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">{content.description}</p>
            {content.reference && <p className="text-xs text-gray-500 mt-2 italic">Reference: {content.reference}</p>}

            {(content.type === EducationalContentType.IMAGE || content.type === EducationalContentType.GRAPH || content.type === EducationalContentType.FORMULA) && (
                <button onClick={() => onGenerateImage(content)} className="mt-3 text-sm bg-brand-blue-light/10 text-brand-blue hover:bg-brand-blue-light/20 font-semibold py-1 px-3 rounded-md transition">
                    Generate Visual Aid
                </button>
            )}

            {content.type === EducationalContentType.DIAGRAM && content.diagramData && (
                <div className="mt-3 h-64 w-full rounded-md border border-gray-300 bg-white overflow-hidden">
                    <InteractiveDiagram data={content.diagramData} />
                </div>
            )}
        </div>
    );
};