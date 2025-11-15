
import React, { useState, useEffect } from 'react';
import { searchForSource } from '../services/geminiService';

interface SourceSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceQuery: string;
    language: string;
    T: Record<string, any>;
}

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin h-8 w-8 text-brand-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export const SourceSearchModal: React.FC<SourceSearchModalProps> = ({ isOpen, onClose, sourceQuery, language, T }) => {
    const [summary, setSummary] = useState<string | null>(null);
    const [sources, setSources] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (sourceQuery && isOpen) {
            const performSearch = async () => {
                setIsLoading(true);
                setError(null);
                setSummary(null);
                setSources([]);
                try {
                    const result = await searchForSource(sourceQuery, language);
                    setSummary(result.summary);
                    setSources(result.sources.filter(s => s.web?.uri)); // Filter out sources without a URI
                } catch (err: any) {
                    console.error("Source search failed:", err);
                    setError(T.errorService);
                } finally {
                    setIsLoading(false);
                }
            };
            performSearch();
        }
    }, [sourceQuery, isOpen, language, T]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">{T.sourceSearchTitle}</h2>
                        <p className="text-sm text-gray-500 mt-1 italic truncate">{sourceQuery}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </header>

                <main className="p-6 overflow-y-auto flex-grow bg-gray-50/50">
                    {isLoading && (
                        <div className="text-center py-8">
                            <LoadingSpinner />
                            <p className="mt-4 text-gray-600">{T.searchingSourceMessage}</p>
                        </div>
                    )}
                    {error && <p className="text-red-600 text-center">{error}</p>}
                    {!isLoading && !error && (
                        <div className="space-y-6">
                            {summary && (
                                <div>
                                    <h3 className="text-md font-semibold text-gray-800 mb-2">{T.aiSummaryTitle}</h3>
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                                        {summary}
                                    </div>
                                </div>
                            )}
                            {sources.length > 0 && (
                                <div>
                                    <h3 className="text-md font-semibold text-gray-800 mb-2">{T.webSourcesTitle}</h3>
                                    <ul className="list-disc list-inside space-y-2 bg-white p-4 border border-gray-200 rounded-lg">
                                        {sources.map((source, index) => (
                                            <li key={index} className="text-xs">
                                                <a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                                                    {source.web.title || source.web.uri}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {!summary && sources.length === 0 && <p className="text-center text-gray-500 py-8">{T.noSourcesFound}</p>}
                        </div>
                    )}
                </main>

                <footer className="p-3 border-t border-gray-200 text-right bg-gray-50">
                    <button onClick={onClose} className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-md transition duration-300">
                        {T.closeButton}
                    </button>
                </footer>
            </div>
        </div>
    );
};
