import React, { useState, useEffect, useCallback, useRef } from 'react';

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
import { DiscussionModal } from './components/DiscussionModal';

// Services
import { 
    generateCorePatientCase, 
    generateMainDetails,
    generateManagementAndContent,
    generateEvidenceAndQuiz,
    generateKnowledgeMap,
    getConceptAbstract
} from './services/geminiService';

// Types
import type { PatientCase, KnowledgeMapData, KnowledgeNode, SavedCase, Snippet, InteractionState, DisciplineSpecificConsideration } from './types';

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


// FIX: Exported the App component to make it available for import.
export const App: React.FC = () => {
    // Analytics
    const { logEvent } = useAnalytics();

    // Core App State
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingDetails, setIsGeneratingDetails] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [patientCase, setPatientCase] = useState<PatientCase | null>(null);
    const [mapData, setMapData] = useState<KnowledgeMapData | null>(null);

    // Knowledge Map State
    const [selectedNodeInfo, setSelectedNodeInfo] = useState<{ node: KnowledgeNode; abstract: string; loading: boolean } | null>(null);
    const [isMapFullscreen, setIsMapFullscreen] = useState(false);
    const knowledgeMapRef = useRef<{ captureAsImage: () => Promise<string> } | null>(null);

    // Internationalization State
    const [language, setLanguage] = useState(localStorage.getItem('synapsis_language') || 'en');

    // Modal States
    const [isSavedWorkOpen, setIsSavedWorkOpen] = useState(false);
    const [isClinicalToolsOpen, setIsClinicalToolsOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [activeDiscussionTopic, setActiveDiscussionTopic] = useState<DisciplineSpecificConsideration | null>(null);

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
            // Stage 1: Generate core case for immediate display
            const coreCase = await generateCorePatientCase(condition, discipline, difficulty, language);
            setPatientCase(coreCase);
            setIsLoading(false);
            setIsGeneratingDetails(true); // Switch to background loading state

            const newCount = generationCount + 1;
            setGenerationCount(newCount);
            localStorage.setItem('synapsis_generation_count', String(newCount));
            
            // Stage 2: Generate remaining details and map in parallel
            const promises = [
                generateMainDetails(coreCase, discipline, difficulty, language),
                generateManagementAndContent(coreCase, discipline, difficulty, language),
                generateEvidenceAndQuiz(coreCase, discipline, difficulty, language),
                generateKnowledgeMap(coreCase, discipline, difficulty, language)
            ];

            const results = await Promise.allSettled(promises);

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const data = result.value;
                    if (index === 3) { // This is the Knowledge Map from the promise array order
                        setMapData(data as KnowledgeMapData);
                    } else { // These are parts of the Patient Case
                        setPatientCase(prevCase => prevCase ? { ...prevCase, ...data } : null);
                    }
                } else {
                    console.error(`Failed to generate part of the case (Promise index ${index}):`, result.reason);
                    // The UI will simply not show the sections that failed, which is a graceful fallback.
                }
            });
            
            setInteractionState(prev => ({ ...prev, caseGenerated: true, caseEdited: false, caseSaved: false, nodeClicks: 0, snippetSaved: false }));

        } catch (err: any) {
            console.error("Error generating core case:", err);
            setError(T.errorService);
            setIsLoading(false);
        } finally {
            setIsGeneratingDetails(false);
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

        // Use the pre-fetched summary from the node data
        setSelectedNodeInfo({ node, abstract: node.summary, loading: false });
        setInteractionState(prev => ({...prev, nodeClicks: prev.nodeClicks + 1}));

    }, [selectedNodeInfo, logEvent]);
    
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

    const handleDiscussNode = (nodeInfo: { node: KnowledgeNode; abstract: string; loading: boolean }) => {
        if (nodeInfo.loading || !nodeInfo.abstract) return;
        setActiveDiscussionTopic({
            aspect: `Concept: ${nodeInfo.node.label}`,
            consideration: `Discipline: ${nodeInfo.node.discipline}\n\n${nodeInfo.abstract}`
        });
    };

    const getKnowledgeMapImage = async (): Promise<string | undefined> => {
        return await knowledgeMapRef.current?.captureAsImage();
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
            
            <main className={`flex-grow p-2 sm:p-4 overflow-hidden ${patientCase ? 'pb-16 lg:pb-0' : ''}`}>
                <div className="max-w-7xl mx-auto h-full flex flex-col space-y-4">
                    <ControlPanel
                        onGenerate={handleGenerate}
                        disabled={isLoading || isGeneratingDetails}
                        T={T}
                        language={language}
                        onSaveCase={handleSaveCase}
                        onOpenSavedWork={() => setIsSavedWorkOpen(true)}
                        onOpenClinicalTools={() => setIsClinicalToolsOpen(true)}
                        isCaseActive={!!patientCase}
                        onGenerateNew={handleGenerateNew}
                    />

                    <TipsCarousel interactionState={interactionState} T={T} />
                    
                    {patientCase ? (
                        <div className="flex-grow overflow-hidden h-full">
                            {/* Sliding container for mobile view */}
                            <div 
                                className="flex h-full transition-transform duration-300 ease-in-out lg:transform-none lg:flex-row lg:gap-4"
                                style={{ transform: `translateX(${mobileView === 'map' ? '-100%' : '0%'})` }}
                            >
                                {/* Case View Wrapper */}
                                <div className="w-full flex-shrink-0 h-full lg:w-3/5">
                                    <div className="h-full overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200">
                                        <PatientCaseView
                                            patientCase={patientCase}
                                            isGeneratingDetails={isGeneratingDetails}
                                            onSave={handlePatientCaseUpdate}
                                            language={language}
                                            T={T}
                                            onSaveSnippet={handleSaveSnippet}
                                            onOpenShare={() => setIsShareModalOpen(true)}
                                            onOpenDiscussion={(topic) => setActiveDiscussionTopic(topic)}
                                            onGetMapImage={getKnowledgeMapImage}
                                            mapData={mapData}
                                        />
                                    </div>
                                </div>

                                {/* Map View Wrapper */}
                                <div className="w-full flex-shrink-0 h-full flex flex-col lg:w-2/5">
                                    {mapData ? (
                                        <KnowledgeMap
                                            ref={knowledgeMapRef}
                                            data={mapData}
                                            onNodeClick={handleNodeClick}
                                            selectedNodeInfo={selectedNodeInfo}
                                            onClearSelection={handleClearNodeSelection}
                                            isMapFullscreen={isMapFullscreen}
                                            setIsMapFullscreen={setIsMapFullscreen}
                                            caseTitle={patientCase.title}
                                            language={language}
                                            T={T}
                                            onDiscussNode={handleDiscussNode}
                                        />
                                    ) : isGeneratingDetails ? (
                                        <div className="w-full h-full flex items-center justify-center bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center">
                                            <LoadingOverlay message={T.buildingMapMessage} subMessages={[]} />
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : (
                        !isLoading && <WelcomeScreen T={T} />
                    )}

                    {isLoading && <LoadingOverlay message={loadingMessage} subMessages={T.loadingSubMessages} />}
                    {error && <ErrorDisplay message={error} />}
                </div>
            </main>
            
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

            {activeDiscussionTopic && (
                <DiscussionModal
                    isOpen={!!activeDiscussionTopic}
                    onClose={() => setActiveDiscussionTopic(null)}
                    topic={activeDiscussionTopic}
                    caseTitle={patientCase?.title || 'this case'}
                    language={language}
                    T={T}
                />
            )}

            <Footer T={T} evaluationDaysRemaining={evaluationDaysRemaining} onOpenFeedback={() => setIsFeedbackModalOpen(true)} />
            <UpdateNotifier />

            {/* Mobile View Toggle */}
            {patientCase && (
                <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-t-lg z-20">
                    <div className="flex justify-around">
                        <button
                            onClick={() => setMobileView('case')}
                            className={`flex-1 py-3 text-sm font-medium flex flex-col items-center justify-center transition-colors ${mobileView === 'case' ? 'text-brand-blue' : 'text-gray-500'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            {T.caseTab}
                        </button>
                        <button
                            onClick={() => setMobileView('map')}
                            className={`flex-1 py-3 text-sm font-medium flex flex-col items-center justify-center transition-colors ${mobileView === 'map' ? 'text-brand-blue' : 'text-gray-500'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>
                            {T.mapTab}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};