import React, { useState } from 'react';
import type { SavedCase, Snippet } from '../types';

interface SavedWorkModalProps {
    isOpen: boolean;
    onClose: () => void;
    savedCases: SavedCase[];
    onLoadCase: (caseId: string) => void;
    onDeleteCase: (caseId: string) => void;
    savedSnippets: Snippet[];
    onDeleteSnippet: (snippetId: string) => void;
    T: Record<string, any>;
}

type ActiveTab = 'cases' | 'snippets';

export const SavedWorkModal: React.FC<SavedWorkModalProps> = ({ 
    isOpen, onClose, savedCases, onLoadCase, onDeleteCase, savedSnippets, onDeleteSnippet, T 
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
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">{T.savedWorkTitle}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </header>
                
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-4 px-4" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('cases')}
                            className={`${activeTab === 'cases' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                        >
                            {T.savedCasesTab} ({savedCases.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('snippets')}
                            className={`${activeTab === 'snippets' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                        >
                             {T.savedSnippetsTab} ({savedSnippets.length})
                        </button>
                    </nav>
                </div>

                <main className="p-4 overflow-y-auto flex-grow bg-gray-50/50">
                    {activeTab === 'cases' && (
                        <div>
                            {savedCases.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">{T.noSavedCasesMessage}</p>
                            ) : (
                                <ul className="space-y-3">
                                    {savedCases.map(c => (
                                        <li key={c.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-gray-800 break-all">{c.title}</p>
                                                <p className="text-xs text-gray-500 mt-1">{new Date(c.savedAt).toLocaleString()}</p>
                                            </div>
                                            <div className="flex items-center space-x-2 flex-shrink-0">
                                                <button onClick={() => onLoadCase(c.id)} className="bg-blue-100 hover:bg-blue-200 text-brand-blue font-bold py-1 px-3 rounded-md transition text-sm">{T.loadButton}</button>
                                                <button onClick={() => onDeleteCase(c.id)} className="bg-red-100 hover:bg-red-200 text-red-700 font-bold py-1 px-3 rounded-md transition text-sm">{T.deleteButton}</button>
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
                                <p className="text-center text-gray-500 py-8">{T.noSavedSnippetsMessage}</p>
                            ) : (
                                <ul className="space-y-3">
                                    {savedSnippets.map(s => (
                                        <li key={s.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-semibold text-gray-800">{s.title}</p>
                                                    <p className="text-xs text-gray-500 mt-1">{new Date(s.savedAt).toLocaleString()}</p>
                                                </div>
                                                <div className="flex items-center space-x-2 flex-shrink-0">
                                                    <button onClick={() => copySnippet(s.content)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-1 px-3 rounded-md transition text-sm">{T.copyButton}</button>
                                                    <button onClick={() => onDeleteSnippet(s.id)} className="bg-red-100 hover:bg-red-200 text-red-700 font-bold py-1 px-3 rounded-md transition text-sm">{T.deleteButton}</button>
                                                </div>
                                            </div>
                                            <p className="mt-3 text-sm text-gray-600 bg-gray-50 p-2 border border-gray-200 rounded-md whitespace-pre-wrap">{s.content}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </main>

                 <footer className="p-3 border-t border-gray-200 text-right bg-gray-50">
                    <button 
                        onClick={onClose} 
                        className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-md transition duration-300"
                    >
                        {T.closeButton}
                    </button>
                </footer>
            </div>
        </div>
    );
}
