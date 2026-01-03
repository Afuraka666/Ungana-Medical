
import React, { useState } from 'react';
import type { SavedCase, Snippet } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { InteractiveDiagram } from './InteractiveDiagram';
import { KnowledgeMap } from './KnowledgeMap';

interface SavedWorkModalProps {
    isOpen: boolean;
    onClose: () => void;
    savedCases: SavedCase[];
    onLoadCase: (caseId: string) => void;
    onDeleteCase: (caseId: string) => void;
    savedSnippets: Snippet[];
    onDeleteSnippet: (snippetId: string) => void;
    T: Record<string, any>;
    language: string;
}

type ActiveTab = 'cases' | 'snippets';

/**
 * Enhanced snippet content renderer that handles rich media
 */
const SnippetVisuals: React.FC<{ snippet: Snippet; language: string; T: Record<string, any> }> = ({ snippet, language, T }) => {
    const [isMapFullscreen, setIsMapFullscreen] = useState(false);
    
    return (
        <div className="space-y-4 mt-3 pt-3 border-t border-gray-100 dark:border-dark-border">
            {/* Handle embedded Diagram Data (e.g. Biochemical Pathways) */}
            {snippet.diagramData && (
                <div className="h-[250px] rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden bg-white">
                    <InteractiveDiagram id={`snippet-diag-${snippet.id}`} data={snippet.diagramData} />
                </div>
            )}

            {/* Handle embedded Knowledge Map Data */}
            {snippet.mapData && (
                <div className={`h-[300px] rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden bg-slate-50 ${isMapFullscreen ? 'fixed inset-0 z-50' : 'relative'}`}>
                    <KnowledgeMap 
                        data={snippet.mapData} 
                        onNodeClick={() => {}} 
                        selectedNodeInfo={null} 
                        onClearSelection={() => {}} 
                        isMapFullscreen={isMapFullscreen} 
                        setIsMapFullscreen={setIsMapFullscreen} 
                        caseTitle={snippet.title} 
                        language={language} 
                        T={T} 
                        onDiscussNode={() => {}} 
                    />
                </div>
            )}

            {/* Handle saved generated illustrations */}
            {snippet.imageData && (
                <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-dark-border shadow-sm">
                    <img src={`data:image/png;base64,${snippet.imageData}`} alt={snippet.title} className="max-w-full h-auto" />
                </div>
            )}
        </div>
    );
};

export const SavedWorkModal: React.FC<SavedWorkModalProps> = ({ 
    isOpen, onClose, savedCases, onLoadCase, onDeleteCase, savedSnippets, onDeleteSnippet, T, language 
}) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('cases');

    if (!isOpen) return null;

    const copySnippet = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            alert('Snippet copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy snippet:', err);
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[85vh] flex flex-col">
                <header className="p-4 border-b border-gray-200 dark:border-dark-border flex justify-between items-center bg-white dark:bg-dark-surface rounded-t-xl transition-colors">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">{T.savedWorkTitle}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition" aria-label="Close">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </header>
                
                <div className="border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface transition-colors">
                    <nav className="-mb-px flex space-x-4 px-4" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('cases')}
                            className={`${activeTab === 'cases' ? 'border-brand-blue text-brand-blue dark:text-brand-blue-light' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-black uppercase text-xs tracking-widest transition-all`}
                        >
                            {T.savedCasesTab} ({savedCases.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('snippets')}
                            className={`${activeTab === 'snippets' ? 'border-brand-blue text-brand-blue dark:text-brand-blue-light' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-black uppercase text-xs tracking-widest transition-all`}
                        >
                             {T.savedSnippetsTab} ({savedSnippets.length})
                        </button>
                    </nav>
                </div>

                <main className="p-4 overflow-y-auto flex-grow bg-gray-50/50 dark:bg-slate-900/50 transition-colors">
                    {activeTab === 'cases' && (
                        <div>
                            {savedCases.length === 0 ? (
                                <p className="text-center text-gray-500 dark:text-gray-400 py-12 font-medium">{T.noSavedCasesMessage}</p>
                            ) : (
                                <ul className="space-y-4">
                                    {savedCases.map(c => (
                                        <li key={c.id} className="bg-white dark:bg-dark-surface p-4 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all hover:shadow-md">
                                            <div className="min-w-0">
                                                <p className="font-black text-gray-900 dark:text-slate-100 truncate text-base">{c.title}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-mono text-gray-400 uppercase tracking-tighter">{new Date(c.savedAt).toLocaleDateString()} @ {new Date(c.savedAt).toLocaleTimeString()}</span>
                                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-brand-blue dark:text-blue-300 text-[8px] font-black uppercase tracking-widest">Case Study</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-2 flex-shrink-0">
                                                <button onClick={() => onLoadCase(c.id)} className="bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-4 rounded-lg transition text-xs shadow-sm uppercase tracking-widest">{T.loadButton}</button>
                                                <button onClick={() => onDeleteCase(c.id)} className="bg-red-50 dark:bg-red-900/10 hover:bg-red-100 text-red-700 dark:text-red-400 font-black py-2 px-4 rounded-lg transition text-xs border border-red-100 dark:border-red-900/30 uppercase tracking-widest">{T.deleteButton}</button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    {activeTab === 'snippets' && (
                         <div>
                            {savedSnippets.length === 0 ? (
                                <p className="text-center text-gray-500 dark:text-gray-400 py-12 font-medium">{T.noSavedSnippetsMessage}</p>
                            ) : (
                                <ul className="space-y-6">
                                    {savedSnippets.map(s => (
                                        <li key={s.id} className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-gray-200 dark:border-dark-border shadow-sm transition-all hover:shadow-md">
                                            <div className="flex justify-between items-start gap-4 mb-4">
                                                <div className="min-w-0">
                                                    <p className="font-black text-gray-900 dark:text-slate-100 text-base leading-tight">{s.title}</p>
                                                    <p className="text-[10px] font-mono text-gray-400 mt-1 uppercase tracking-tighter">{new Date(s.savedAt).toLocaleString()}</p>
                                                </div>
                                                <div className="flex items-center space-x-2 flex-shrink-0">
                                                    <button onClick={() => copySnippet(s.content)} className="p-2 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-all shadow-xs" title={T.copyButton}>
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                                    </button>
                                                    <button onClick={() => onDeleteSnippet(s.id)} className="p-2 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 rounded-full transition-all shadow-xs" title={T.deleteButton}>
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                                <MarkdownRenderer content={s.content} />
                                            </div>

                                            {/* Rich visual content rendering */}
                                            <SnippetVisuals snippet={s} language={language} T={T} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </main>

                 <footer className="p-4 border-t border-gray-200 dark:border-dark-border text-right bg-gray-50 dark:bg-dark-surface/50 rounded-b-xl transition-colors">
                    <button 
                        onClick={onClose} 
                        className="bg-brand-blue hover:bg-blue-800 text-white font-black py-2.5 px-8 rounded-xl transition duration-300 shadow-md uppercase tracking-widest text-xs"
                    >
                        {T.closeButton}
                    </button>
                </footer>
            </div>
        </div>
    );
}
