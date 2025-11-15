
import React, { useState, useEffect, useCallback } from 'react';

// Components
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { PatientCaseView } from './components/PatientCaseView';
import { KnowledgeMap } from './components/KnowledgeMap';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ErrorDisplay } from './components/ErrorDisplay';
import { SavedWorkModal } from './components/SavedWorkModal';
import { ShareModal } from './components/ShareModal';
import { ClinicalToolsModal } from './components/ClinicalToolsModal';
import { FeedbackModal } from './components/FeedbackModal';
import { TipsCarousel } from './components/TipsCarousel';
import { UpdateNotifier } from './components/UpdateNotifier';
import { Footer } from './components/Footer';
import { EvaluationScreen } from './components/EvaluationScreen';

// Services
import { generatePatientCaseAndMap, getConceptAbstract } from './services/geminiService';

// Types
import type { PatientCase, KnowledgeMapData, KnowledgeNode, SavedCase, Snippet, InteractionState } from './types';

// i18n
import { translations, supportedLanguages } from './i18n';

// Hooks
import { useAnalytics } from './contexts/analytics';

// Helper: Decompresses a URL-safe Base64 string back into a JSON object
async function decodeAndDecompress(encodedString: string): Promise<any | null> {
    try {
        // Make it standard Base64 again
        const base64 = encodedString.replace(/-/g, '+').replace(/_/g, '/');
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const stream = new Blob([bytes]).stream();
        const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
        const reader = decompressedStream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const decompressedBlob = new Blob(chunks);
        const jsonString = await decompressedBlob.text();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Decompression failed:", error);
        return null;
    }
}


const App: React.FC = () => {
    // Analytics
    const { logEvent } = useAnalytics();

    // Core App State
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [patientCase, setPatientCase] = useState<PatientCase | null>(null);
    const [mapData, setMapData] = useState<KnowledgeMapData | null>(null);

    // Knowledge Map State
    const [selectedNodeInfo, setSelectedNodeInfo] = useState<{ node: KnowledgeNode; abstract: string; loading: boolean } | null>(null);
    const [isMapFullscreen, setIsMapFullscreen] = useState(false);

    // Internationalization State
    const [language, setLanguage] = useState(localStorage.getItem('synapsis_language') || 'en');

    // Modal States
    const [isSavedWorkOpen, setIsSavedWorkOpen] = useState(false);
    const [isClinicalToolsOpen, setIsClinicalToolsOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    // Saved Data State
    const [savedCases, setSavedCases] = useState<SavedCase[]>([]);
    const [savedSnippets, setSavedSnippets] = useState<Snippet[]>([]);

    // User Interaction Tracking for Tips
    const [interactionState, setInteractionState] = useState<InteractionState>({
        caseGenerated: false,
        caseEdited: false,
        caseSaved: false,
        snippetSaved: false,
        nodeClicks: 0,
    });
    
    // Legacy state for tracking generations
    const [generationCount, setGenerationCount] = useState(0);

    // Evaluation State
    const [showEvaluationScreen, setShowEvaluationScreen] = useState(false);
    const [evaluationDaysRemaining, setEvaluationDaysRemaining] = useState<number | null>(null);

    // Mobile view state
    const [mobileView, setMobileView] = useState<'case' | 'map'>('case');

    const T = translations[language] || translations.en;
    
    // -- EFFECTS --

    // Check evaluation status on load
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('case')) {
            // When loading a shared case, bypass evaluation check
            return;
        }

        try {
            const trialStartDateStr = localStorage.getItem('synapsis_trial_start_date');
            const hasSubmitted = localStorage.getItem('synapsis_feedback_submitted') === 'true';

            let trialStartDate: Date;
            if (trialStartDateStr) {
                trialStartDate = new Date(trialStartDateStr);
            } else {
                trialStartDate = new Date();
                localStorage.setItem('synapsis_trial_start_date', trialStartDate.toISOString());
            }

            const now = new Date();
            const timeDiff = now.getTime() - trialStartDate.getTime();
            const daysElapsed = Math.floor(timeDiff / (1000 * 3600 * 24));
            
            const daysRemaining = 30 - daysElapsed;
            setEvaluationDaysRemaining(daysRemaining);

            if (daysRemaining <= 0 && !hasSubmitted) {
                setShowEvaluationScreen(true);
            }

        } catch (e) {
            console.error("Failed to process evaluation status", e);
        }
    }, []);
    
    // Load saved data from localStorage
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('case')) {
            // When loading a shared case, skip other initial loads.
            return;
        }

        try {
            const cases = JSON.parse(localStorage.getItem('synapsis_saved_cases') || '[]');
            const snippets = JSON.parse(localStorage.getItem('synapsis_saved_snippets') || '[]');
            const count = parseInt(localStorage.getItem('synapsis_generation_count') || '0', 10);
            setSavedCases(cases);
            setSavedSnippets(snippets);
            setGenerationCount(count);
        } catch (e) {
            console.error("Failed to load data from localStorage", e);
        }
    }, []);
    
    // Decompress case data from URL on load
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const caseDataParam = urlParams.get('case');
        if (caseDataParam) {
            setIsLoading(true);
            setLoadingMessage('Loading shared case...');
            decodeAndDecompress(caseDataParam).then(decodedCase => {
                if (decodedCase) {
                    setPatientCase(decodedCase as PatientCase);
                    // A shared case doesn't include map data, it would need to be regenerated.
                    // Or the share function could be updated to include it.
                    // For now, we'll just load the case.
                    setMapData(null); 
                } else {
                    setError('Failed to load the shared case. The link might be invalid.');
                }
                setIsLoading(false);
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            });
        }
    }, []);

    // -- HANDLERS --
    
    const handleLanguageChange = (langCode: string) => {
        setLanguage(langCode);
        localStorage.setItem('synapsis_language', langCode);
    };

    const handleFeedbackSubmitted = () => {
        localStorage.setItem('synapsis_feedback_submitted', 'true');
        setShowEvaluationScreen(false);
    };

    const handleGenerate = async (condition: string, discipline: string, difficulty: string) => {
        logEvent('generate_case', { condition, discipline, difficulty });
        setError(null);
        setIsLoading(true);
        setLoadingMessage(T.generatingCaseMessage(condition));
        setPatientCase(null);
        setMapData(null);
        setSelectedNodeInfo(null);
        setMobileView('case');
        
        try {
            const { case: newCase, mapData: newMapData } = await generatePatientCaseAndMap(condition, discipline, difficulty, language);
            setPatientCase(newCase);
            setMapData(newMapData);
            setInteractionState(prev => ({ ...prev, caseGenerated: true, caseEdited: false, caseSaved: false, nodeClicks: 0, snippetSaved: false }));
            
            const newCount = generationCount + 1;
            setGenerationCount(newCount);
            localStorage.setItem('synapsis_generation_count', String(newCount));
        } catch (err: any) {
            console.error(err);
            setError(T.errorService);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateNew = () => {
        setPatientCase(null);
        setMapData(null);
        setError(null);
        setSelectedNodeInfo(null);
        setMobileView('case');
    };

    const handleNodeClick = useCallback(async (node: KnowledgeNode) => {
        logEvent('node_click', { node_label: node.label });
        if (selectedNodeInfo?.node.id === node.id) {
            setSelectedNodeInfo(null);
            return;
        }
        
        setSelectedNodeInfo({ node, abstract: '', loading: true });
        setInteractionState(prev => ({...prev, nodeClicks: prev.nodeClicks + 1}));

        try {
            const caseContext = patientCase?.title || '';
            const abstract = await getConceptAbstract(node.label, caseContext, language);
            setSelectedNodeInfo({ node, abstract, loading: false });
        } catch (err: any) {
            console.error(err);
            if (err.message && (err.message.includes("API key not valid") || err.message.includes("Requested entity was not found") || err.message.includes("API_KEY"))) {
                setError(T.errorService);
                setSelectedNodeInfo(null);
            } else {
                setSelectedNodeInfo({ node, abstract: T.errorAbstract, loading: false });
            }
        }
    }, [patientCase, language, T.errorAbstract, selectedNodeInfo, T.errorService, logEvent]);
    
    const handleClearNodeSelection = useCallback(() => {
        setSelectedNodeInfo(null);
    }, []);
    
    const handleSaveCase = () => {
        if (!patientCase || !mapData) return;
        logEvent('save_case', { case_title: patientCase.title });
        const newSavedCase: SavedCase = {
            id: crypto.randomUUID(),
            title: patientCase.title,
            savedAt: new Date().toISOString(),
            caseData: patientCase,
            mapData: mapData,
        };
        const updatedCases = [...savedCases, newSavedCase];
        setSavedCases(updatedCases);
        localStorage.setItem('synapsis_saved_cases', JSON.stringify(updatedCases));
        setInteractionState(prev => ({...prev, caseSaved: true }));
        alert('Case saved successfully!');
    };
    
    const handleLoadCase = (caseId: string) => {
        const caseToLoad = savedCases.find(c => c.id === caseId);
        if (caseToLoad) {
            setPatientCase(caseToLoad.caseData);
            setMapData(caseToLoad.mapData);
            setIsSavedWorkOpen(false);
            setMobileView('case');
        }
    };
    
    const handleDeleteCase = (caseId: string) => {
        const updatedCases = savedCases.filter(c => c.id !== caseId);
        setSavedCases(updatedCases);
        localStorage.setItem('synapsis_saved_cases', JSON.stringify(updatedCases));
    };

    const handleSaveSnippet = (title: string, content: string) => {
        logEvent('save_snippet', { snippet_title: title });
        const newSnippet: Snippet = {
            id: crypto.randomUUID(),
            title,
            content,
            savedAt: new Date().toISOString(),
        };
        const updatedSnippets = [...savedSnippets, newSnippet];
        setSavedSnippets(updatedSnippets);
        localStorage.setItem('synapsis_saved_snippets', JSON.stringify(updatedSnippets));
        setInteractionState(prev => ({ ...prev, snippetSaved: true }));
    };
    
    const handleDeleteSnippet = (snippetId: string) => {
        const updatedSnippets = savedSnippets.filter(s => s.id !== snippetId);
        setSavedSnippets(updatedSnippets);
        localStorage.setItem('synapsis_saved_snippets', JSON.stringify(updatedSnippets));
    };
    
    const handlePatientCaseUpdate = (updatedCase: PatientCase) => {
        setPatientCase(updatedCase);
        setInteractionState(prev => ({ ...prev, caseEdited: true }));
    };

    // -- RENDER LOGIC --

    if (showEvaluationScreen) {
        return <EvaluationScreen T={T} onFeedbackSubmitted={handleFeedbackSubmitted} />;
    }
    
    return (
        <div className="flex flex-col h-screen bg-gray-100 font-sans">
            <Header
                supportedLanguages={supportedLanguages}
                currentLanguage={language}
                onLanguageChange={handleLanguageChange}
                T={T}
            />
            
            <main className={`flex-grow p-2 sm:p-4 overflow-hidden ${patientCase && mapData ? 'pb-16 lg:pb-0' : ''}`}>
                <div className="max-w-7xl mx-auto h-full flex flex-col space-y-4">
                    <ControlPanel
                        onGenerate={handleGenerate}
                        disabled={isLoading}
                        T={T}
                        language={language}
                        onSaveCase={handleSaveCase}
                        onOpenSavedWork={() => setIsSavedWorkOpen(true)}
                        onOpenClinicalTools={() => setIsClinicalToolsOpen(true)}
                        isCaseActive={!!patientCase}
                        onGenerateNew={handleGenerateNew}
                    />
                    
                    <TipsCarousel interactionState={interactionState} T={T} />
                    {error && <ErrorDisplay message={error} />}

                    <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-0 relative">
                        {isLoading && <LoadingOverlay message={loadingMessage} subMessages={T.loadingSubMessages} />}
                        
                        {patientCase ? (
                            <>
                                <div className={`bg-white rounded-lg shadow-lg border border-gray-200 overflow-y-auto ${!mapData ? 'lg:col-span-2' : ''} ${mapData ? (mobileView === 'case' ? 'block' : 'hidden lg:block') : 'block'}`}>
                                    <PatientCaseView 
                                        patientCase={patientCase}
                                        onSave={handlePatientCaseUpdate}
                                        language={language}
                                        T={T}
                                        onSaveSnippet={handleSaveSnippet}
                                        onOpenShare={() => setIsShareModalOpen(true)}
                                    />
                                </div>
                                
                                {mapData && (
                                    <div className={`transition-all duration-500 ease-in-out ${isMapFullscreen ? 'fixed inset-0 z-30' : 'relative min-h-[400px] lg:min-h-0'} ${mobileView === 'map' ? 'block' : 'hidden lg:block'}`}>
                                        <KnowledgeMap
                                            data={mapData}
                                            onNodeClick={handleNodeClick}
                                            selectedNodeInfo={selectedNodeInfo}
                                            onClearSelection={handleClearNodeSelection}
                                            isMapFullscreen={isMapFullscreen}
                                            setIsMapFullscreen={setIsMapFullscreen}
                                            caseTitle={patientCase.title}
                                            language={language}
                                            T={T}
                                        />
                                    </div>
                                )}
                            </>
                        ) : !isLoading && !error ? (
                            <div className="lg:col-span-2">
                                <WelcomeScreen T={T} />
                            </div>
                        ) : null}
                    </div>
                </div>
            </main>
            
            <Footer 
                T={T} 
                evaluationDaysRemaining={evaluationDaysRemaining}
                onOpenFeedback={() => setIsFeedbackModalOpen(true)}
            />

            {/* Mobile Bottom Navigation */}
            {patientCase && mapData && (
                 <div className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-[0_-2px_5px_rgba(0,0,0,0.05)]">
                    <div className="flex justify-around items-center">
                        <button
                            onClick={() => setMobileView('case')}
                            aria-pressed={mobileView === 'case'}
                            className={`flex-1 flex flex-col items-center justify-center py-2 px-1 text-xs font-semibold transition ${mobileView === 'case' ? 'text-brand-blue' : 'text-gray-500 hover:text-brand-blue'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-0.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                <path fillRule="evenodd" d="M4 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h.01a1 1 0 100-2H10zm3 0a1 1 0 000 2h.01a1 1 0 100-2H13z" clipRule="evenodd" />
                            </svg>
                            <span>{T.caseTab}</span>
                        </button>
                        <button
                            onClick={() => setMobileView('map')}
                            aria-pressed={mobileView === 'map'}
                            className={`flex-1 flex flex-col items-center justify-center py-2 px-1 text-xs font-semibold transition ${mobileView === 'map' ? 'text-brand-blue' : 'text-gray-500 hover:text-brand-blue'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-0.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                            </svg>
                            <span>{T.mapTab}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Modals */}
            <SavedWorkModal 
                isOpen={isSavedWorkOpen}
                onClose={() => setIsSavedWorkOpen(false)}
                savedCases={savedCases}
                onLoadCase={handleLoadCase}
                onDeleteCase={handleDeleteCase}
                savedSnippets={savedSnippets}
                onDeleteSnippet={handleDeleteSnippet}
                T={T}
            />
            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                patientCase={patientCase}
                T={T}
            />
            <ClinicalToolsModal
                isOpen={isClinicalToolsOpen}
                onClose={() => setIsClinicalToolsOpen(false)}
                T={T}
                language={language}
            />
            <FeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                T={T}
            />
            
            <UpdateNotifier />
        </div>
    );
};

export default App;
