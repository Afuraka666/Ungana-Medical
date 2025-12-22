
import React, { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { EducationalContentType, Discipline } from '../types';
import type { PatientCase, EducationalContent, QuizQuestion, DisciplineSpecificConsideration, MultidisciplinaryConnection, TraceableEvidence, FurtherReading, ProcedureDetails, PatientOutcome, KnowledgeMapData } from '../types';
import { DisciplineColors } from './KnowledgeMap';
import { QuizView } from './QuizView';
import { ImageGenerator } from './ImageGenerator';
import { TextToSpeechPlayer } from './TextToSpeechPlayer';
import { InteractiveDiagram } from './InteractiveDiagram';
import { SourceSearchModal } from './SourceSearchModal';
import { enrichCaseWithWebSources, getConceptAbstract } from '../services/geminiService';
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

    if(patientCase.multidisciplinaryConnections) {
        text += `## ${T.multidisciplinaryConnections}\n`;
        patientCase.multidisciplinaryConnections.forEach(conn => {
            text += `- **${conn.discipline}:** ${conn.connection}\n`;
        });
        text += '\n';
    }

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

const svgToDataURL = async (svgEl: SVGSVGElement): Promise<string> => {
    const g = svgEl.querySelector('g');
    if (!g) return '';

    const bbox = g.getBBox();
    if (bbox.width === 0 || bbox.height === 0) return '';

    const padding = 40;
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;

    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', width.toString());
    svgClone.setAttribute('height', height.toString());
    svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);

    const gClone = svgClone.querySelector('g');
    if (gClone) {
        gClone.removeAttribute('transform');
    }
    
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', width.toString());
    bgRect.setAttribute('height', height.toString());
    bgRect.setAttribute('fill', 'white');
    bgRect.setAttribute('x', `${bbox.x - padding}`);
    bgRect.setAttribute('y', `${bbox.y - padding}`);
    svgClone.prepend(bgRect);

    const xml = new XMLSerializer().serializeToString(svgClone);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const image64 = `data:image/svg+xml;base64,${svg64}`;

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 2;
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png', 1.0));
            } else {
                resolve('');
            }
        };
        img.onerror = (e) => {
            console.error("Failed to load SVG image for canvas conversion", e);
            resolve('');
        };
        img.src = image64;
    });
};

export const PatientCaseView: React.FC<PatientCaseViewProps> = ({ patientCase: initialPatientCase, isGeneratingDetails, onSave, language, T, onSaveSnippet, onOpenShare, onOpenDiscussion, onGetMapImage, mapData }) => {
  const { state: patientCase, setState: setPatientCase, undo, redo, canUndo, canRedo, resetState } = useHistoryState<PatientCase>(initialPatientCase);
  const [isEditing, setIsEditing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [activeImageGenerator, setActiveImageGenerator] = useState<{ content: EducationalContent; index: number } | null>(null);
  const [activeSourceSearch, setActiveSourceSearch] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  
  const [isEnrichingEvidence, setIsEnrichingEvidence] = useState(false);
  const [evidenceSources, setEvidenceSources] = useState<any[]>([]);
  const [readingSources, setReadingSources] = useState<any[]>([]);

  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resetState(initialPatientCase);
  }, [initialPatientCase, resetState]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
              setShowExportMenu(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleImageGenerated = useCallback((itemIndex: number, imageBase64: string) => {
    setPatientCase(prevCase => {
        const newEducationalContent = [...(prevCase.educationalContent || [])];
        newEducationalContent[itemIndex] = {
            ...newEducationalContent[itemIndex],
            imageData: imageBase64,
        };
        return { ...prevCase, educationalContent: newEducationalContent };
    });
    setActiveImageGenerator(null);
  }, [setPatientCase]);

  const handleEnrichSources = async () => {
    setIsEnrichingEvidence(true);
    setEvidenceSources([]);
    setReadingSources([]);

    try {
        const { newEvidence, newReadings, groundingSources } = await enrichCaseWithWebSources(patientCase, language);
        if (newEvidence.length > 0 || newReadings.length > 0) {
            setPatientCase(prevCase => ({
                ...prevCase,
                traceableEvidence: [...(prevCase.traceableEvidence || []), ...newEvidence],
                furtherReadings: [...(prevCase.furtherReadings || []), ...newReadings],
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

  const getVisualAssets = async () => {
      const visualPromises = [];
      // Biochemical Pathway
      if (patientCase.biochemicalPathway && (patientCase.biochemicalPathway.diagramData || patientCase.biochemicalPathway.imageData)) {
          visualPromises.push((async () => {
              let dataUrl: string | undefined;
              if (patientCase.biochemicalPathway!.imageData) {
                  dataUrl = `data:image/png;base64,${patientCase.biochemicalPathway!.imageData}`;
              } else if (patientCase.biochemicalPathway!.diagramData) {
                  const diagramEl = document.querySelector('#diagram-biochem svg') as SVGSVGElement;
                  if (diagramEl) dataUrl = await svgToDataURL(diagramEl);
              }
              return { title: T.biochemicalPathwaySection, content: patientCase.biochemicalPathway!, dataUrl };
          })());
      }
      // Visual Educational Content
      if (patientCase.educationalContent) {
          patientCase.educationalContent.forEach((item, i) => {
              if (item.diagramData || item.imageData) {
                  visualPromises.push((async () => {
                      let dataUrl: string | undefined;
                      if (item.imageData) {
                          dataUrl = `data:image/png;base64,${item.imageData}`;
                      } else if (item.diagramData) {
                          const diagramEl = document.querySelector(`#diagram-edu-${i} svg`) as SVGSVGElement;
                          if (diagramEl) dataUrl = await svgToDataURL(diagramEl);
                      }
                      return { title: item.title, content: item, dataUrl };
                  })());
              }
          });
      }
      // Knowledge Map
      if (onGetMapImage) {
          visualPromises.push((async () => {
              const mapImgData = await onGetMapImage();
              return { title: T.knowledgeMapConcepts, content: { description: 'Overview of the key concepts and their connections.', reference: '' }, dataUrl: mapImgData };
          })());
      }
      return (await Promise.all(visualPromises)).filter(v => v && v.dataUrl);
  };
  
  const handleDownloadPdf = async () => {
    if (!patientCase) return;
    setIsExporting(true);
    setShowExportMenu(false);

    try {
        const resolvedVisuals = await getVisualAssets();
        const { jsPDF } = (window as any).jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        const brandColor = '#1e3a8a';
        const textColor = '#111827';
        
        const pageHeader = (data: any) => {
            doc.setFontSize(10);
            doc.setTextColor('#4a5568');
            doc.text('Ungana Medical Case Study', data.settings.margin.left, 10);
        };

        const pageFooter = (data: any) => {
            const pageCount = (doc as any).internal.getNumberOfPages();
            doc.setFontSize(10);
            doc.setTextColor('#4a5568');
            doc.text(`Page ${data.pageNumber} of ${pageCount}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
        };
        
        doc.autoTable({
            body: [[patientCase.title]],
            startY: 15,
            theme: 'plain',
            styles: { fontSize: 22, fontStyle: 'bold', halign: 'center', textColor: brandColor },
            didDrawPage: pageHeader,
        });

        const addSection = (title: string, content: string) => {
            if (!content) return;
            doc.autoTable({
                startY: (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : undefined,
                head: [[title]],
                body: [[content]],
                theme: 'grid',
                headStyles: { fillColor: brandColor, fontSize: 14 },
                bodyStyles: { textColor: textColor, fontSize: 12, cellPadding: 3, minCellHeight: 10 },
                didDrawPage: pageFooter,
            });
        };
        
        const addTableSection = (title: string, head: string[], body: any[][]) => {
            if (body.length === 0) return;
            doc.autoTable({
                startY: (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : undefined,
                head: [[{ content: title, colSpan: head.length, styles: { halign: 'center', fillColor: brandColor, fontSize: 14 } }]],
                body: [head, ...body],
                theme: 'grid',
                headStyles: { fillColor: '#3b82f6', fontSize: 12, fontStyle: 'bold' },
                bodyStyles: { textColor: textColor, fontSize: 12, cellPadding: 2, overflow: 'linebreak' },
                didDrawPage: pageFooter,
            });
        };

        addSection(T.patientProfile, patientCase.patientProfile);
        addSection(T.presentingComplaint, patientCase.presentingComplaint);
        addSection(T.history, patientCase.history);
        if (patientCase.multidisciplinaryConnections?.length) addTableSection(T.multidisciplinaryConnections, ['Discipline', 'Connection'], patientCase.multidisciplinaryConnections.map(c => [c.discipline, c.connection]));
        if (patientCase.disciplineSpecificConsiderations?.length) addTableSection(T.managementConsiderations, ['Aspect', 'Consideration'], patientCase.disciplineSpecificConsiderations.map(c => [c.aspect, c.consideration]));
        if (patientCase.traceableEvidence?.length) addTableSection(T.traceableEvidence, ['Claim', 'Source'], patientCase.traceableEvidence.map(e => [e.claim, e.source]));
        if (patientCase.furtherReadings?.length) addTableSection(T.furtherReading, ['Topic', 'Reference'], patientCase.furtherReadings.map(r => [r.topic, r.reference]));

        for (const visual of resolvedVisuals) {
            if (!visual.dataUrl) continue;
            doc.addPage();
            const margin = 15;
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.setFontSize(14);
            doc.setTextColor(brandColor);
            doc.text(visual.title, pageWidth / 2, 20, { align: 'center' });
            let finalY = 30;
            try {
                const imgProps = doc.getImageProperties(visual.dataUrl);
                const maxWidth = pageWidth - 2 * margin;
                const maxHeight = pageHeight - 70;
                let imgWidth = imgProps.width;
                let imgHeight = imgProps.height;
                const aspectRatio = imgWidth / imgHeight;
                if (imgWidth > maxWidth) { imgWidth = maxWidth; imgHeight = imgWidth / aspectRatio; }
                if (imgHeight > maxHeight) { imgHeight = maxHeight; imgWidth = imgHeight * aspectRatio; }
                const x = (pageWidth - imgWidth) / 2;
                doc.addImage(visual.dataUrl, 'PNG', x, 30, imgWidth, imgHeight);
                finalY = 30 + imgHeight + 10;
            } catch (e) { finalY = 40; }
            const desc = `${visual.content.description}${visual.content.reference ? `\n\nReference: ${visual.content.reference}` : ''}`;
            if (desc.trim()) {
                doc.setFontSize(12); doc.setTextColor(textColor);
                const splitDesc = doc.splitTextToSize(desc, pageWidth - 2 * margin);
                doc.text(splitDesc, margin, finalY);
            }
        }
        const totalPages = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) { doc.setPage(i); pageHeader({ settings: { margin: { left: 15 } } }); pageFooter({ pageNumber: i, totalPages, settings: { margin: { left: 15 } } }); }
        doc.save(`${patientCase.title.replace(/\s+/g, '_')}.pdf`);
    } catch (e) { alert("PDF generation failed."); } finally { setIsExporting(false); }
  };

  const handleDownloadWord = async () => {
    if (!patientCase) return;
    setIsExporting(true);
    setShowExportMenu(false);

    try {
        const resolvedVisuals = await getVisualAssets();
        const sections = [];

        // Title
        sections.push(new Paragraph({ text: patientCase.title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 400 } }));

        const addTextSection = (title: string, content: string) => {
            if (!content) return;
            sections.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));
            sections.push(new Paragraph({ text: content, spacing: { after: 200 } }));
        };

        const addTableSection = (title: string, headers: string[], rows: string[][]) => {
            if (rows.length === 0) return;
            sections.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));
            sections.push(new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({ children: headers.map(h => new TableCell({ children: [new Paragraph({ text: h, style: 'bold' })], shading: { fill: "f3f4f6" } })) }),
                    ...rows.map(row => new TableRow({ children: row.map(cell => new TableCell({ children: [new Paragraph({ text: cell })] })) }))
                ]
            }));
        };

        addTextSection(T.patientProfile, patientCase.patientProfile);
        addTextSection(T.presentingComplaint, patientCase.presentingComplaint);
        addTextSection(T.history, patientCase.history);
        if (patientCase.multidisciplinaryConnections?.length) addTableSection(T.multidisciplinaryConnections, ['Discipline', 'Connection'], patientCase.multidisciplinaryConnections.map(c => [c.discipline, c.connection]));
        if (patientCase.disciplineSpecificConsiderations?.length) addTableSection(T.managementConsiderations, ['Aspect', 'Consideration'], patientCase.disciplineSpecificConsiderations.map(c => [c.aspect, c.consideration]));
        if (patientCase.traceableEvidence?.length) addTableSection(T.traceableEvidence, ['Claim', 'Source'], patientCase.traceableEvidence.map(e => [e.claim, e.source]));
        if (patientCase.furtherReadings?.length) addTableSection(T.furtherReading, ['Topic', 'Reference'], patientCase.furtherReadings.map(r => [r.topic, r.reference]));

        // Visuals
        for (const visual of resolvedVisuals) {
            sections.push(new Paragraph({ text: visual.title, heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 }, pageBreakBefore: true }));
            try {
                const base64Data = visual.dataUrl!.split(',')[1];
                sections.push(new Paragraph({
                    children: [new ImageRun({
                        data: Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)),
                        transformation: { width: 500, height: 400 }
                    })],
                    alignment: AlignmentType.CENTER
                }));
            } catch (e) { sections.push(new Paragraph({ text: "[Visual Error: Could not render image]" })); }
            sections.push(new Paragraph({ text: visual.content.description, spacing: { before: 200 } }));
            if (visual.content.reference) sections.push(new Paragraph({ text: `Reference: ${visual.content.reference}`, style: 'italic' }));
        }

        const doc = new Document({ sections: [{ children: sections }] });
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${patientCase.title.replace(/\s+/g, '_')}.docx`;
        a.click();
    } catch (e) { console.error(e); alert("Word generation failed."); } finally { setIsExporting(false); }
  };

  const handleDownloadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(patientCase));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `${patientCase.title.replace(/\s+/g, '_')}.json`);
    a.click();
    setShowExportMenu(false);
  };

  const handleDownloadText = () => {
    const text = formatCaseForClipboard(patientCase, T);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patientCase.title.replace(/\s+/g, '_')}.txt`;
    a.click();
    setShowExportMenu(false);
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
    ) : (
        <MarkdownRenderer content={value} />
    );
  };
  
  return (
    <div className="p-4 sm:p-6 relative">
      <header className="sticky top-0 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 p-3 sm:p-4 bg-white/80 backdrop-blur-sm border-b border-gray-200 z-10">
        <div className="flex justify-between items-center">
          <h2 className="text-xl sm:text-2xl font-bold text-brand-text truncate pr-2">{patientCase.title}</h2>
          <div className="flex items-center space-x-1">
            {isEditing ? (
              <>
                <button onClick={undo} disabled={!canUndo} title={T.undoButton} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition disabled:text-gray-300 disabled:cursor-not-allowed">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 00-1 1v1.135a4.002 4.002 0 00-2.995 2.562l-1.34-1.34a1 1 0 10-1.414 1.414l1.586 1.586A4.002 4.002 0 008 10a4 4 0 104-4V3a1 1 0 00-1-1zm0 8a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /><path d="M4.343 5.757a1 1 0 001.414-1.414L4.94 3.525A8.001 8.001 0 0010 2a8 8 0 100 16 8 8 0 008-8h-2c0 3.314-2.686 6-6 6S4 13.314 4 10c0-.212.01-.422.029-.631l.314.314z" /></svg>
                </button>
                <button onClick={redo} disabled={!canRedo} title={T.redoButton} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition disabled:text-gray-300 disabled:cursor-not-allowed">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a1 1 0 001-1v-1.135a4.002 4.002 0 002.995-2.562l1.34 1.34a1 1 0 101.414-1.414l-1.586-1.586A4.002 4.002 0 0012 10a4 4 0 10-4 4V17a1 1 0 001 1zm0-8a2 2 0 100 4 2 2 0 000 4z" clipRule="evenodd" /><path d="M15.657 14.243a1 1 0 00-1.414 1.414l.817.817a8.001 8.001 0 00-5.06-14.475V2a8 8 0 100 16c.212 0 .422-.01.631-.029l-.314-.314z" /></svg>
                </button>
                <button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-1 px-3 rounded-md transition text-sm">{T.saveButton}</button>
                <button onClick={handleCancel} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-1 px-3 rounded-md transition text-sm">{T.cancelButton}</button>
              </>
            ) : (
              <>
                <div className="relative" ref={exportMenuRef}>
                    <button 
                        onClick={() => setShowExportMenu(!showExportMenu)} 
                        disabled={isExporting} 
                        title={T.exportButton} 
                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition disabled:text-gray-300 disabled:cursor-not-allowed flex items-center"
                    >
                        {isExporting ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        )}
                        <svg className={`h-4 w-4 ml-0.5 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    {showExportMenu && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 z-20 animate-fade-in py-1">
                            <button onClick={handleDownloadPdf} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2">
                                <svg className="h-4 w-4 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1h-17c-.552 0-1-.448-1-1v-19c0-.552.448-1 1-1h10.363zm4.137 17l-1.5-5h-1l-1.5 5h1.1l.3-1h1.2l.3 1h1.1zm-4.5-5h-2.5v5h1.1v-1.6h1.4c.828 0 1.5-.672 1.5-1.5s-.672-1.9-1.5-1.9zm-4 0h-2.5v5h2.5c.828 0 1.5-.672 1.5-1.5v-2c0-.828-.672-1.5-1.5-1.5zm6.5 1.4c0 .221-.179.4-.4.4h-1.4v-.8h1.4c.221 0 .4.179.4.4zm-4 1.1h-1.4v-1.1h1.4c.221 0 .4.179.4.4v.3c0 .221-.179.4-.4.4zm3.1-.7l-.4 1.3h-.8l-.4-1.3.1-.3h1.4l.1.3z" /></svg>
                                <span>{T.downloadPdfButton}</span>
                            </button>
                            <button onClick={handleDownloadWord} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2">
                                <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-3 8h6v1h-6v-1zm0 2h6v1h-6v-1zm0 2h6v1h-6v-1zm0 2h6v1h-6v-1zm0 2h6v1h-6v-1z" /></svg>
                                <span>{T.downloadWordButton}</span>
                            </button>
                            <div className="border-t border-gray-100 my-1"></div>
                            <button onClick={handleDownloadJson} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2">
                                <span className="font-mono font-bold text-xs text-gray-500">JSON</span>
                                <span>{T.downloadJSONButton}</span>
                            </button>
                            <button onClick={handleDownloadText} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2">
                                <span className="font-mono font-bold text-xs text-gray-500">TXT</span>
                                <span>{T.downloadTextButton}</span>
                            </button>
                        </div>
                    )}
                </div>
                <button onClick={onOpenShare} title={T.shareButtonTitle} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>
                </button>
                <button onClick={handleCopy} title={T.copyCaseButton} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
                  {isCopied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" /></svg>
                  )}
                </button>
                <button onClick={() => setIsEditing(true)} title={T.editButton} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue transition">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-4">
        <Section title={T.patientProfile} onCopy={() => handleCopySection(patientCase.patientProfile)} onSaveSnippet={() => onSaveSnippet(T.patientProfile, patientCase.patientProfile)} T={T}>
            <EditableText value={patientCase.patientProfile} onChange={(e) => handleTextChange(e, 'patientProfile')} isEditing={isEditing} />
        </Section>
        <Section title={T.presentingComplaint} onCopy={() => handleCopySection(patientCase.presentingComplaint)} onSaveSnippet={() => onSaveSnippet(T.presentingComplaint, patientCase.presentingComplaint)} T={T}>
            <EditableText value={patientCase.presentingComplaint} onChange={(e) => handleTextChange(e, 'presentingComplaint')} isEditing={isEditing} />
        </Section>
        <Section title={T.history} onCopy={() => handleCopySection(patientCase.history)} onSaveSnippet={() => onSaveSnippet(T.history, patientCase.history)} T={T}>
            <EditableText value={patientCase.history} onChange={(e) => handleTextChange(e, 'history')} isEditing={isEditing} />
        </Section>

        { (patientCase.procedureDetails || patientCase.outcomes) ? (
            <Section title={T.anestheticDataSection} onCopy={() => {}} onSaveSnippet={() => {}} T={T}>
                {patientCase.procedureDetails && <div className="text-sm"><strong>{T.procedureLabel}:</strong> {patientCase.procedureDetails.procedureName} | <strong>{T.asaScoreLabel}:</strong> {patientCase.procedureDetails.asaScore}</div>}
                {patientCase.outcomes && <div className="text-sm mt-2"><strong>{T.outcomeSummaryLabel}:</strong> {patientCase.outcomes.outcomeSummary} ({T.icuAdmissionLabel}: {patientCase.outcomes.icuAdmission ? T.yes : T.no}, {T.lengthOfStayLabel}: {patientCase.outcomes.lengthOfStayDays} {T.days})</div>}
            </Section>
        ) : isGeneratingDetails ? (
            <Section title={T.anestheticDataSection} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section>
        ) : null}

        { patientCase.biochemicalPathway ? (
            <Section title={T.biochemicalPathwaySection} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(patientCase.biochemicalPathway!.title, patientCase.biochemicalPathway!.description)} T={T}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                        <h4 className="text-md font-semibold text-gray-800">{patientCase.biochemicalPathway.title}</h4>
                        <TextToSpeechPlayer textToRead={`${patientCase.biochemicalPathway.title}. ${patientCase.biochemicalPathway.description}`} language={language} />
                    </div>
                    <button 
                        onClick={() => onOpenDiscussion({ aspect: patientCase.biochemicalPathway!.title, consideration: patientCase.biochemicalPathway!.description })} 
                        title={T.discussButton} 
                        className="text-sm bg-blue-100 hover:bg-blue-200 text-brand-blue font-semibold py-1 px-3 rounded-md transition flex-shrink-0"
                    >
                        {T.discussButton}
                    </button>
                </div>
                <p className="text-xs text-gray-500 italic mb-2">{patientCase.biochemicalPathway.reference}</p>
                <div className="mt-2">
                    <MarkdownRenderer content={patientCase.biochemicalPathway.description} />
                </div>
                {patientCase.biochemicalPathway.diagramData && <div className="mt-4 h-80 rounded-lg border border-gray-200"><InteractiveDiagram id="diagram-biochem" data={patientCase.biochemicalPathway.diagramData} /></div>}
            </Section>
        ) : isGeneratingDetails ? (
            <Section title={T.biochemicalPathwaySection} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section>
        ) : null}
        
        { patientCase.multidisciplinaryConnections ? (
            <Section title={T.multidisciplinaryConnections} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.multidisciplinaryConnections, patientCase.multidisciplinaryConnections!.map(c => `${c.discipline}: ${c.connection}`).join('\n'))} T={T}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {patientCase.multidisciplinaryConnections.map((conn, index) => (
                        <div 
                            key={index} 
                            onClick={(e) => {
                                // Make the entire card clickable
                                onOpenDiscussion({ aspect: conn.discipline, consideration: conn.connection });
                            }}
                            className="bg-gray-50 border border-gray-200 rounded-lg p-4 transition hover:shadow-md hover:border-blue-300 flex flex-col justify-between h-full cursor-pointer group"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center">
                                        <div className="p-2 rounded-full mr-3 group-hover:bg-blue-100 transition-colors" style={{ backgroundColor: `${DisciplineColors[conn.discipline]}20` }}>
                                            <DisciplineIcon discipline={conn.discipline} className="h-5 w-5" style={{ color: DisciplineColors[conn.discipline] }} />
                                        </div>
                                        <h5 className="font-bold group-hover:text-brand-blue transition-colors" style={{ color: DisciplineColors[conn.discipline] }}>{conn.discipline}</h5>
                                    </div>
                                </div>
                                <div className="text-sm text-gray-700 leading-relaxed mb-3">
                                    <MarkdownRenderer content={conn.connection} />
                                </div>
                            </div>
                            
                            {/* Explicit Button - now always visible */}
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent double triggering
                                    onOpenDiscussion({ aspect: conn.discipline, consideration: conn.connection });
                                }} 
                                className="self-end mt-2 flex items-center space-x-1 text-xs bg-white border border-blue-200 text-brand-blue hover:bg-blue-50 font-semibold py-1.5 px-3 rounded-md transition shadow-sm"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                                <span>{T.discussButton}</span>
                            </button>
                        </div>
                    ))}
                </div>
            </Section>
        ) : isGeneratingDetails ? (
            <Section title={T.multidisciplinaryConnections} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section>
        ) : null}

        { patientCase.disciplineSpecificConsiderations ? (
            <Section title={T.managementConsiderations} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.managementConsiderations, patientCase.disciplineSpecificConsiderations!.map(c => `${c.aspect}: ${c.consideration}`).join('\n'))} T={T}>
                <ul className="space-y-3">
                    {patientCase.disciplineSpecificConsiderations.map((item, index) => (
                        <li key={index}>
                            <div className="flex justify-between items-center">
                                <strong className="text-gray-800">{item.aspect}</strong>
                                <button onClick={() => onOpenDiscussion(item)} title={T.discussButton} className="text-sm bg-blue-100 hover:bg-blue-200 text-brand-blue font-semibold py-1 px-3 rounded-md transition">{T.discussButton}</button>
                            </div>
                            <div className="mt-1">
                                <MarkdownRenderer content={item.consideration} />
                            </div>
                        </li>
                    ))}
                </ul>
            </Section>
        ) : isGeneratingDetails ? (
            <Section title={T.managementConsiderations} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section>
        ) : null}

        { patientCase.educationalContent ? (
            <Section title={T.educationalContent} onCopy={() => {}} onSaveSnippet={() => onSaveSnippet(T.educationalContent, patientCase.educationalContent!.map(c => `${c.title}: ${c.description}`).join('\n\n'))} T={T}>
                <div className="space-y-4">
                    {patientCase.educationalContent.map((item, index) => (
                        <div key={index} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <h4 className="font-semibold text-gray-800">{item.title}</h4>
                                    <p className="text-xs text-gray-500 italic">{item.reference}</p>
                                </div>
                                <div className="flex-shrink-0 flex items-center space-x-2">
                                    {item.type === EducationalContentType.IMAGE && !item.imageData && (
                                        <button onClick={() => setActiveImageGenerator({ content: item, index })} className="text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold py-1 px-3 rounded-md transition">Generate Image</button>
                                    )}
                                    <button 
                                        onClick={() => onOpenDiscussion({ aspect: item.title, consideration: item.description })} 
                                        title={T.discussButton} 
                                        className="text-sm bg-blue-100 hover:bg-blue-200 text-brand-blue font-semibold py-1 px-3 rounded-md transition"
                                    >
                                        {T.discussButton}
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2">
                                <MarkdownRenderer content={item.description} />
                            </div>
                            {item.diagramData && <div className="mt-3 h-72 rounded-lg border border-gray-200 bg-white"><InteractiveDiagram id={`diagram-edu-${index}`} data={item.diagramData} /></div>}
                            {item.imageData && (
                                <div className="mt-3">
                                    <img 
                                        src={`data:image/png;base64,${item.imageData}`} 
                                        alt={item.title}
                                        onClick={() => setEnlargedImage(item.imageData!)}
                                        className="rounded-md border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                                        style={{ maxWidth: '100%', height: 'auto' }}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </Section>
        ) : isGeneratingDetails ? (
             <Section title={T.educationalContent} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section>
        ) : null}
        
        { (patientCase.traceableEvidence || patientCase.furtherReadings) ? (
            <Section title={T.evidenceAndReading} onCopy={() => {}} onSaveSnippet={() => {}} T={T} onEnrich={handleEnrichSources} isEnriching={isEnrichingEvidence} groundingSources={[...evidenceSources, ...readingSources]} onSourceClick={setActiveSourceSearch}>
                {patientCase.traceableEvidence && (
                    <div>
                        <h4 className="font-semibold text-gray-800">{T.traceableEvidence}</h4>
                        <ul className="list-disc list-inside space-y-2 mt-2">
                            {patientCase.traceableEvidence.map((item, index) => (
                            <li key={index}><span className="font-medium">"{item.claim}"</span> <button onClick={() => setActiveSourceSearch(item.source)} className="text-blue-600 hover:underline text-xs ml-1">({item.source})</button></li>
                            ))}
                        </ul>
                    </div>
                )}
                {patientCase.furtherReadings && (
                    <div className="mt-4">
                        <h4 className="font-semibold text-gray-800">{T.furtherReading}</h4>
                        <ul className="list-disc list-inside space-y-2 mt-2">
                            {patientCase.furtherReadings.map((item, index) => (
                                <li key={index}><span className="font-medium">{item.topic}:</span> <button onClick={() => setActiveSourceSearch(item.reference)} className="text-blue-600 hover:underline text-xs ml-1">{item.reference}</button></li>
                            ))}
                        </ul>
                    </div>
                )}
            </Section>
        ) : isGeneratingDetails ? (
            <Section title={T.evidenceAndReading} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section>
        ) : null}

        { patientCase.quiz ? (
            <QuizView quiz={patientCase.quiz} T={T} />
        ) : isGeneratingDetails ? (
             <Section title={T.quizTitle} onCopy={() => {}} onSaveSnippet={() => {}} T={T}><SkeletonLoader /></Section>
        ) : null}
      </div>

      {activeImageGenerator && <ImageGenerator content={activeImageGenerator.content} onClose={() => setActiveImageGenerator(null)} language={language} T={T} onImageGenerated={(imageData) => handleImageGenerated(activeImageGenerator.index, imageData)} />}
      
      {activeSourceSearch && (
          <SourceSearchModal
            isOpen={!!activeSourceSearch}
            onClose={() => setActiveSourceSearch(null)}
            sourceQuery={activeSourceSearch}
            language={language}
            T={T}
          />
      )}
      
      {enlargedImage && (
        <div 
            className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 animate-fade-in"
            onClick={() => setEnlargedImage(null)}
            role="dialog"
            aria-modal="true"
        >
            <img 
                src={`data:image/png;base64,${enlargedImage}`} 
                alt="Enlarged view"
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />
            <button 
                onClick={() => setEnlargedImage(null)} 
                className="absolute top-4 right-4 text-white hover:text-gray-300 transition"
                aria-label="Close"
            >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
      )}
    </div>
  );
};
