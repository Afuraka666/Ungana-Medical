import React, { useState, useEffect, useCallback } from 'react';
import { EducationalContentType, Discipline } from '../types';
import type { PatientCase, EducationalContent, QuizQuestion, DisciplineSpecificConsideration, MultidisciplinaryConnection, TraceableEvidence, FurtherReading } from '../types';
import { DisciplineColors } from './KnowledgeMap';
import { QuizView } from './QuizView';
import { ImageGenerator } from './ImageGenerator';
import { TextToSpeechPlayer } from './TextToSpeechPlayer';
import { DiscussionModal } from './DiscussionModal';
import { InteractiveDiagram } from './InteractiveDiagram';

interface PatientCaseViewProps {
  patientCase: PatientCase;
  onSave: (updatedCase: PatientCase) => void;
  language: string;
  T: Record<string, any>;
}

// A custom hook to manage state history for undo/redo
function useHistoryState<T>(initialState: T) {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const state = history[currentIndex];

  const setState = useCallback((newState: T | ((prevState: T) => T)) => {
    const value = typeof newState === 'function'
      ? (newState as (prevState: T) => T)(state)
      : newState;
    
    // Avoid adding duplicate states to history
    if (JSON.stringify(value) === JSON.stringify(state)) {
      return;
    }

    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(value);
    setHistory(newHistory);
    setCurrentIndex(newHistory.length - 1);
  }, [history, currentIndex, state]);

  const undo = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, history.length]);
  
  const resetState = useCallback((newState: T) => {
      setHistory([newState]);
      setCurrentIndex(0);
  }, []);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  return { state, setState, undo, redo, canUndo, canRedo, resetState };
}


const formatCaseForClipboard = (patientCase: PatientCase, T: Record<string, any>): string => {
    let text = `Title: ${patientCase.title}\n\n`;

    text += `## ${T.patientProfile}\n`;
    text += `${patientCase.patientProfile}\n\n`;

    text += `## ${T.presentingComplaint}\n`;
    text += `${patientCase.presentingComplaint}\n\n`;

    text += `## ${T.history}\n`;
    text += `${patientCase.history}\n\n`;

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


const DisciplineTag: React.FC<{ discipline: Discipline }> = ({ discipline }) => {
  const color = DisciplineColors[discipline] || '#6b7280';
  return (
    <span
      className="text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full"
      style={{ backgroundColor: `${color}20`, color: color }}
    >
      {discipline}
    </span>
  );
};

const CopyButton: React.FC<{ textToCopy: string; T: Record<string, any> }> = ({ textToCopy, T }) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy.trim()).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    };

    return (
        <button
            onClick={handleCopy}
            title={isCopied ? T.copiedButton : T.copySectionButton}
            className={`transition duration-200 ease-in-out p-1 rounded-full ${isCopied ? 'text-green-500' : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
        >
            {isCopied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                    <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h6a2 2 0 00-2-2H5z" />
                </svg>
            )}
        </button>
    );
};

const CaseSection: React.FC<{ title: string; children: React.ReactNode; textForSpeech?: string; language?: string; onAddItem?: () => void; isEditing?: boolean; T?: Record<string, any>; copyText?: string; }> = ({ title, children, textForSpeech, language, onAddItem, isEditing, T, copyText }) => (
  <div className="mb-4">
    <div className="flex justify-between items-center border-b-2 border-brand-blue/30 pb-1 mb-2">
        <h3 className="text-lg font-bold text-brand-blue">{title}</h3>
        <div className="flex items-center space-x-2">
            {copyText && !isEditing && T && <CopyButton textToCopy={copyText} T={T} />}
            {isEditing && onAddItem && T && (
                <button onClick={onAddItem} className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-2 rounded-md transition duration-300 flex items-center space-x-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    <span>{T.addButton}</span>
                </button>
            )}
            {textForSpeech && language && !isEditing && <TextToSpeechPlayer textToRead={textForSpeech} language={language} />}
        </div>
    </div>
    <div className="text-sm text-gray-700 space-y-2">{children}</div>
  </div>
);

const EditableField: React.FC<{ value: string; onChange: (value: string) => void; isEditing: boolean; isTextarea?: boolean }> = ({ value, onChange, isEditing, isTextarea = false }) => {
  if (!isEditing) {
    return <p className="text-sm text-gray-700 space-y-2 whitespace-pre-wrap">{value}</p>;
  }

  const commonClasses = "w-full p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition text-sm";
  
  if (isTextarea) {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} className={`${commonClasses} min-h-[100px]`} />;
  }
  
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={commonClasses} />;
};

const EducationalContentItem: React.FC<{ item: EducationalContent, isEditing: boolean, onChange: (field: keyof EducationalContent, value: string) => void, onVisualize: () => void }> = ({ item, isEditing, onChange, onVisualize }) => {
    const iconPaths = {
        [EducationalContentType.DIAGRAM]: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
        [EducationalContentType.GRAPH]: 'M4 4h16v16H4V4zm2 14h12V6H6v12zM8 10h2v6H8v-6zm3 3h2v3h-2v-3zm3-5h2v8h-2v-8z',
        [EducationalContentType.FORMULA]: 'M19 13H5v-2h14v2zm-7-6a2 2 0 100-4 2 2 0 000 4zm0 10a2 2 0 100-4 2 2 0 000 4z',
        [EducationalContentType.IMAGE]: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'
    };
    const icon = iconPaths[item.type] || iconPaths.Image;
    const showInteractiveDiagram = !isEditing && item.type === EducationalContentType.DIAGRAM && !!item.diagramData;

    return (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
            <div className="flex items-center space-x-2">
                <svg className="h-5 w-5 text-brand-blue flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d={icon}></path></svg>
                {isEditing ? (
                    <input type="text" value={item.title} onChange={e => onChange('title', e.target.value)} className="w-full p-1 border border-blue-200 rounded-md bg-gray-50 focus:ring-1 focus:ring-brand-blue-light font-semibold text-base" />
                ) : (
                    <h4 className="font-semibold text-gray-800 text-base">{item.title}</h4>
                )}
            </div>
             {isEditing ? (
                <textarea value={item.description} onChange={e => onChange('description', e.target.value)} className="w-full mt-1 p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition text-sm min-h-[80px]" />
            ) : (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.description}</p>
            )}

            {showInteractiveDiagram && item.diagramData && <InteractiveDiagram data={item.diagramData} />}

            <div className="flex justify-between items-center mt-2">
                {isEditing ? (
                    <input type="text" value={item.reference} onChange={e => onChange('reference', e.target.value)} className="w-full p-1 border border-blue-200 rounded-md bg-gray-50 focus:ring-1 focus:ring-brand-blue-light text-xs italic" />
                ) : (
                    <p className="text-xs text-gray-500 italic">Reference: {item.reference}</p>
                )}
                {!isEditing && !showInteractiveDiagram && (
                    <button onClick={onVisualize} className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-bold py-1 px-3 rounded-md transition duration-300 ease-in-out flex items-center space-x-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5 2a1 1 0 00-1 1v1.586l-2.707 2.707a1 1 0 000 1.414l4 4a1 1 0 001.414 0l4-4a1 1 0 000-1.414L8.414 4.586V3a1 1 0 00-1-1H5zM2 12a1 1 0 011-1h1.586l2.707-2.707a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0L4.586 13H3a1 1 0 01-1-1zm15.293-2.293a1 1 0 000-1.414l-4-4a1 1 0 00-1.414 0l-4 4a1 1 0 000 1.414l2.707 2.707H17a1 1 0 100-2h-1.293z" clipRule="evenodd" />
                        </svg>
                        <span>Visualize with AI</span>
                    </button>
                )}
            </div>
        </div>
    );
}

export const PatientCaseView: React.FC<PatientCaseViewProps> = ({ patientCase, onSave, language, T }) => {
  const [isEditing, setIsEditing] = useState(false);
  const { 
    state: editableCase, 
    setState: setEditableCase, 
    undo, 
    redo, 
    canUndo, 
    canRedo,
    resetState
  } = useHistoryState<PatientCase>(patientCase);
  const [visualizingContent, setVisualizingContent] = useState<EducationalContent | null>(null);
  const [discussionTopic, setDiscussionTopic] = useState<DisciplineSpecificConsideration | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const caseWithDefaults = {
      ...patientCase,
      educationalContent: patientCase.educationalContent || [],
      quiz: patientCase.quiz || [],
    };
    resetState(caseWithDefaults);
  }, [patientCase, resetState]);

  const handleToggleEdit = () => {
    if (isEditing) {
      onSave(editableCase);
    }
    setIsEditing(!isEditing);
  };

  const handleCopyToClipboard = () => {
    const caseText = formatCaseForClipboard(patientCase, T);
    navigator.clipboard.writeText(caseText).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy case details.');
    });
  };

  const handleChange = (field: keyof PatientCase, value: string) => {
    setEditableCase(prev => ({ ...prev, [field]: value } as PatientCase));
  };

  const handleArrayChange = (arrayName: keyof PatientCase, index: number, field: string, value: any) => {
    setEditableCase(prev => {
      const newArray = [...(prev[arrayName] as any[])];
      if (newArray[index]) {
        newArray[index] = { ...newArray[index], [field]: value };
      }
      return { ...prev, [arrayName]: newArray };
    });
  };
  
  const handleAddItem = (arrayName: 'multidisciplinaryConnections' | 'disciplineSpecificConsiderations' | 'traceableEvidence' | 'furtherReadings') => {
    setEditableCase(prev => {
        const newArray = [...(prev[arrayName] as any[])];
        let newItem: any;
        switch (arrayName) {
            case 'multidisciplinaryConnections':
                newItem = { discipline: Discipline.BIOCHEMISTRY, connection: '' } as MultidisciplinaryConnection;
                break;
            case 'disciplineSpecificConsiderations':
                newItem = { aspect: 'New Aspect', consideration: '' } as DisciplineSpecificConsideration;
                break;
            case 'traceableEvidence':
                newItem = { claim: 'New Claim', source: '' } as TraceableEvidence;
                break;
            case 'furtherReadings':
                newItem = { topic: 'New Topic', reference: '' } as FurtherReading;
                break;
            default:
                return prev;
        }
        return { ...prev, [arrayName]: [...newArray, newItem] };
    });
  };

  const handleDeleteItem = (arrayName: keyof PatientCase, index: number) => {
    setEditableCase(prev => {
        const newArray = [...(prev[arrayName] as any[])];
        newArray.splice(index, 1);
        return { ...prev, [arrayName]: newArray };
    });
  };

  const handleQuizOptionChange = (qIndex: number, oIndex: number, value: string) => {
      setEditableCase(prev => {
          const newQuiz = [...(prev.quiz as QuizQuestion[])];
          if(newQuiz[qIndex]) {
              const newOptions = [...newQuiz[qIndex].options];
              newOptions[oIndex] = value;
              newQuiz[qIndex] = { ...newQuiz[qIndex], options: newOptions };
          }
          return {...prev, quiz: newQuiz };
      });
  };

  // FIX: Allow the formatter function to accept an index, which is needed for numbering quiz questions.
  const formatArrayToString = (items: any[] | undefined, formatter: (item: any, index: number) => string): string => {
    if (!items) return '';
    return items.map(formatter).join('\n\n');
  };

  const multidisciplinaryConnectionsText = formatArrayToString(
      editableCase.multidisciplinaryConnections,
      (item: MultidisciplinaryConnection) => `• ${item.discipline}: ${item.connection}`
  );

  const disciplineSpecificConsiderationsText = formatArrayToString(
      editableCase.disciplineSpecificConsiderations,
      (item: DisciplineSpecificConsideration) => `• ${item.aspect}:\n  ${item.consideration}`
  );

  const educationalContentText = formatArrayToString(
      editableCase.educationalContent,
      (item: EducationalContent) => `${item.title} (${item.type}):\n${item.description}\nReference: ${item.reference}`
  );

  const traceableEvidenceText = formatArrayToString(
      editableCase.traceableEvidence,
      (item: TraceableEvidence) => `• Claim: "${item.claim}"\n  Source: ${item.source}`
  );

  const furtherReadingsText = formatArrayToString(
      editableCase.furtherReadings,
      (item: FurtherReading) => `• ${item.topic}: ${item.reference}`
  );
  
  const quizText = formatArrayToString(
      editableCase.quiz,
      (q: QuizQuestion, i: number) => `${i + 1}. ${q.question}\n${q.options.map((opt, oIndex) => `   ${String.fromCharCode(65 + oIndex)}. ${opt}`).join('\n')}\n\n   Explanation: ${q.explanation}`
  );

  return (
    <>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
          <h2 className="text-2xl font-bold text-gray-800 break-words">{patientCase.title}</h2>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={handleCopyToClipboard}
              disabled={isCopied}
              title={isCopied ? T.copiedButton : T.copyCaseButton}
              className={`font-bold py-2 px-3 rounded-md transition duration-300 ease-in-out text-sm flex items-center justify-center space-x-2 ${isCopied ? 'bg-green-100 text-green-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              {isCopied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h6a2 2 0 00-2-2H5z" /></svg>
              )}
            </button>
            {isEditing && (
                <>
                <button onClick={undo} disabled={!canUndo} title={T.undoButton} className="font-bold py-2 px-3 rounded-md transition duration-300 ease-in-out text-sm flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </button>
                 <button onClick={redo} disabled={!canRedo} title={T.redoButton} className="font-bold py-2 px-3 rounded-md transition duration-300 ease-in-out text-sm flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                </button>
                </>
            )}
            <button
              onClick={handleToggleEdit}
              className={`font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out text-sm flex items-center justify-center space-x-2 ${isEditing ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-100 hover:bg-blue-200 text-brand-blue'}`}
            >
              {isEditing ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
              )}
              <span>{isEditing ? T.saveButton : T.editButton}</span>
            </button>
          </div>
        </div>
        
        <CaseSection title={T.patientProfile} copyText={editableCase.patientProfile} T={T} isEditing={isEditing}>
          <EditableField isEditing={isEditing} value={editableCase.patientProfile} onChange={(val) => handleChange('patientProfile', val)} />
        </CaseSection>

        <CaseSection title={T.presentingComplaint} textForSpeech={editableCase.presentingComplaint} language={language} copyText={editableCase.presentingComplaint} T={T} isEditing={isEditing}>
          <EditableField isEditing={isEditing} value={editableCase.presentingComplaint} onChange={(val) => handleChange('presentingComplaint', val)} />
        </CaseSection>

        <CaseSection title={T.history} textForSpeech={editableCase.history} language={language} copyText={editableCase.history} T={T} isEditing={isEditing}>
          <EditableField isEditing={isEditing} value={editableCase.history} onChange={(val) => handleChange('history', val)} isTextarea />
        </CaseSection>

        <CaseSection title={T.multidisciplinaryConnections} onAddItem={() => handleAddItem('multidisciplinaryConnections')} isEditing={isEditing} T={T} copyText={multidisciplinaryConnectionsText}>
          <ul className="space-y-3">
            {editableCase.multidisciplinaryConnections.map((conn, index) => (
              <li key={index} className="flex items-start group">
                <div className="flex-shrink-0 mt-1">
                  <DisciplineTag discipline={conn.discipline} />
                </div>
                <div className="ml-1 flex-grow">
                  {isEditing ? (
                    <textarea value={conn.connection} onChange={(e) => handleArrayChange('multidisciplinaryConnections', index, 'connection', e.target.value)} className="w-full p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition text-sm min-h-[60px]" />
                  ) : (
                    <p className="text-sm text-gray-600 ml-1 whitespace-pre-wrap">{conn.connection}</p>
                  )}
                </div>
                 {isEditing && (
                    <button onClick={() => handleDeleteItem('multidisciplinaryConnections', index)} title={T.deleteButtonTitle} className="ml-2 text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    </button>
                )}
              </li>
            ))}
          </ul>
        </CaseSection>

        {editableCase.disciplineSpecificConsiderations?.length > 0 && (
          <CaseSection title={T.managementConsiderations} onAddItem={() => handleAddItem('disciplineSpecificConsiderations')} isEditing={isEditing} T={T} copyText={disciplineSpecificConsiderationsText}>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
              {editableCase.disciplineSpecificConsiderations.map((item, index) => (
                <div key={index} className="border-b border-blue-200/50 last:border-b-0 pb-3 last:pb-0 group">
                  <div className="flex justify-between items-center">
                    {isEditing ? (
                        <input type="text" value={item.aspect} onChange={e => handleArrayChange('disciplineSpecificConsiderations', index, 'aspect', e.target.value)} className="w-full font-semibold text-gray-800 text-base p-1 border border-blue-200 rounded-md bg-gray-50 focus:ring-1"/>
                    ) : (
                        <h4 className="font-semibold text-gray-800 text-base">{item.aspect}</h4>
                    )}
                     {!isEditing && (
                        <button onClick={() => setDiscussionTopic(item)} className="bg-purple-100 text-purple-700 hover:bg-purple-200 text-xs font-bold py-1 px-3 rounded-md transition duration-300 ease-in-out flex items-center space-x-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.832 8.832 0 01-4.323-.972l-3.35 1.116a.5.5 0 01-.63-.63l1.116-3.35A8.832 8.832 0 012 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM4.445 13.046a.5.5 0 01.373.636l-.743 2.228 2.228-.743a.5.5 0 01.636.373A6.96 6.96 0 0010 16a6 6 0 100-12 6.96 6.96 0 00-2.932.652.5.5 0 01-.636.373l-2.228-.743.743 2.228a.5.5 0 01-.373.636A6.96 6.96 0 004 10a6.968 6.968 0 00.445 3.046z" clipRule="evenodd" /></svg>
                            <span>{T.discussButton}</span>
                        </button>
                    )}
                  </div>
                  <div className="flex items-start">
                    {isEditing ? (
                        <textarea value={item.consideration} onChange={(e) => handleArrayChange('disciplineSpecificConsiderations', index, 'consideration', e.target.value)} className="w-full mt-1 p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition text-sm min-h-[60px]" />
                    ) : (
                        <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{item.consideration}</p>
                    )}
                    {isEditing && (
                        <button onClick={() => handleDeleteItem('disciplineSpecificConsiderations', index)} title={T.deleteButtonTitle} className="ml-2 mt-1 text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CaseSection>
        )}

        {editableCase.educationalContent?.length > 0 && (
          <CaseSection title={T.educationalContent} T={T} copyText={educationalContentText} isEditing={isEditing}>
              <div className="space-y-4">
                  {editableCase.educationalContent.map((item, index) => (
                      <EducationalContentItem 
                          key={index}
                          item={item}
                          isEditing={isEditing}
                          onChange={(field, value) => handleArrayChange('educationalContent', index, field, value)}
                          onVisualize={() => setVisualizingContent(item)}
                      />
                  ))}
              </div>
          </CaseSection>
        )}

        {(editableCase.traceableEvidence?.length > 0 || editableCase.furtherReadings?.length > 0) && (
          <CaseSection title={T.evidenceAndReading} T={T} isEditing={isEditing}>
            {editableCase.traceableEvidence?.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-gray-800 text-base">{T.traceableEvidence}</h4>
                     <div className="flex items-center space-x-2">
                        {!isEditing && <CopyButton textToCopy={traceableEvidenceText} T={T} />}
                        {isEditing && (
                            <button onClick={() => handleAddItem('traceableEvidence')} className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-2 rounded-md transition duration-300 flex items-center space-x-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                <span>{T.addButton}</span>
                            </button>
                        )}
                    </div>
                </div>
                <ul className="space-y-3">
                  {editableCase.traceableEvidence.map((item, index) => (
                    <li key={index} className="border-l-4 border-blue-200 pl-3 group">
                      <div className="flex items-start">
                        <div className="flex-grow space-y-1">
                          {isEditing ? (
                              <textarea value={item.claim} onChange={(e) => handleArrayChange('traceableEvidence', index, 'claim', e.target.value)} className="w-full p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition text-sm font-medium" />
                          ) : (
                              <p className="text-sm text-gray-700 font-medium">"{item.claim}"</p>
                          )}
                          <div className="flex items-center">
                            {item.source.toLowerCase().includes('systematic review') && !isEditing && (
                              <span className="text-xs font-bold mr-2 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                Systematic Review
                              </span>
                            )}
                            {isEditing ? (
                                  <textarea value={item.source} onChange={(e) => handleArrayChange('traceableEvidence', index, 'source', e.target.value)} className="w-full p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition text-xs italic" />
                              ) : (
                                <p className="text-xs text-gray-500 italic">- {item.source.replace(/\(Systematic Review\)/ig, '').trim()}</p>
                              )}
                          </div>
                        </div>
                        {isEditing && (
                            <button onClick={() => handleDeleteItem('traceableEvidence', index)} title={T.deleteButtonTitle} className="ml-2 text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {editableCase.furtherReadings?.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-gray-800 text-base">{T.furtherReading}</h4>
                     <div className="flex items-center space-x-2">
                        {!isEditing && <CopyButton textToCopy={furtherReadingsText} T={T} />}
                        {isEditing && (
                            <button onClick={() => handleAddItem('furtherReadings')} className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-2 rounded-md transition duration-300 flex items-center space-x-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                <span>{T.addButton}</span>
                            </button>
                        )}
                    </div>
                </div>
                <ul className="space-y-2">
                  {editableCase.furtherReadings.map((item, index) => (
                    <li key={index} className="text-sm text-gray-600 group">
                      <div className="flex items-start">
                        <div className="flex-grow">
                          {isEditing ? (
                              <>
                                  <input type="text" value={item.topic} onChange={(e) => handleArrayChange('furtherReadings', index, 'topic', e.target.value)} className="w-full mb-1 p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition text-sm font-semibold" />
                                  <textarea value={item.reference} onChange={(e) => handleArrayChange('furtherReadings', index, 'reference', e.target.value)} className="w-full p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition text-sm" />
                              </>
                          ) : (
                              <>
                                  <span className="font-semibold">{item.topic}:</span> {item.reference}
                              </>
                          )}
                        </div>
                        {isEditing && (
                            <button onClick={() => handleDeleteItem('furtherReadings', index)} title={T.deleteButtonTitle} className="ml-2 text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CaseSection>
        )}

        {editableCase.quiz?.length > 0 && (
            <div className="mt-6">
              {isEditing ? (
                  <CaseSection title="Edit Quiz">
                      <div className="space-y-6">
                          {editableCase.quiz.map((q, qIndex) => (
                              <div key={qIndex} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                  <label className="font-semibold text-sm">Question {qIndex+1}</label>
                                  <textarea value={q.question} onChange={e => handleArrayChange('quiz', qIndex, 'question', e.target.value)} className="w-full mt-1 p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light transition text-sm min-h-[60px]" />
                                  
                                  <label className="font-semibold text-sm mt-2 block">Options</label>
                                  <div className="space-y-2 mt-1">
                                      {q.options.map((opt, oIndex) => (
                                          <input key={oIndex} type="text" value={opt} onChange={e => handleQuizOptionChange(qIndex, oIndex, e.target.value)} className="w-full p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light transition text-sm" />
                                      ))}
                                  </div>

                                  <label className="font-semibold text-sm mt-2 block">Correct Answer (Index 0-3)</label>
                                  <input type="number" value={q.correctAnswerIndex} onChange={e => handleArrayChange('quiz', qIndex, 'correctAnswerIndex', e.target.value)} className="w-full p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light transition text-sm" />

                                  <label className="font-semibold text-sm mt-2 block">Explanation</label>
                                  <textarea value={q.explanation} onChange={e => handleArrayChange('quiz', qIndex, 'explanation', e.target.value)} className="w-full mt-1 p-2 border border-blue-200 rounded-md bg-gray-50 focus:ring-2 focus:ring-brand-blue-light transition text-sm min-h-[60px]" />
                              </div>
                          ))}
                      </div>
                  </CaseSection>
              ) : (
                  <CaseSection title={T.quizTitle} copyText={quizText} T={T} isEditing={isEditing}>
                    <QuizView quiz={editableCase.quiz} T={T} />
                  </CaseSection>
              )}
            </div>
        )}
      </div>
      {visualizingContent && (
        <ImageGenerator 
          content={visualizingContent} 
          onClose={() => setVisualizingContent(null)}
        />
      )}
      {discussionTopic && (
        <DiscussionModal
            isOpen={!!discussionTopic}
            onClose={() => setDiscussionTopic(null)}
            topic={discussionTopic}
            caseTitle={patientCase.title}
            language={language}
            T={T}
        />
      )}
    </>
  );
};
