
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
import { EvaluationScreen } from './components/EvaluationScreen';
import { Footer } from './components/Footer';

// Services
import { generatePatientCaseAndMap, getConceptAbstract } from './services/geminiService';

// Types
import type { PatientCase, KnowledgeMapData, KnowledgeNode, SavedCase, Snippet, InteractionState } from './types';

// i18n
import { translations, supportedLanguages } from './i18n';

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
    
    // Evaluation Screen Logic
    const [generationCount, setGenerationCount] = useState(0);
    const [showEvaluationScreen, setShowEvaluationScreen] = useState(false);
    const [evaluationDaysRemaining, setEvaluationDaysRemaining] = useState<number | null>(null);
    const EVALUATION_PERIOD_DAYS = 14;

    const T = translations[language] || translations.en;
    
    // -- EFFECTS --
    
    // Load saved data and generation count from localStorage
    useEffect(() => {
        try {
            const cases = JSON.parse(localStorage.getItem('synapsis_saved_cases') || '[]');
            const snippets = JSON.parse(localStorage.getItem('synapsis_saved_snippets') || '[]');
            const count = parseInt(localStorage.getItem('synapsis_generation_count') || '0', 10);
            setSavedCases(cases);
            setSavedSnippets(snippets);
            setGenerationCount(count);

            // Evaluation period logic
            let startDateStr = localStorage.getItem('synapsis_eval_start_date');
            if (!startDateStr) {
                startDateStr = new Date().toISOString();
                localStorage.setItem('synapsis_eval_start_date', startDateStr);
            }
            const startDate = new Date(startDateStr);
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + EVALUATION_PERIOD_DAYS);
            const today = new Date();
            const remainingTime = endDate.getTime() - today.getTime();
            const remainingDays = Math.max(0, Math.ceil(remainingTime / (1000 * 60 * 60 * 24)));
            setEvaluationDaysRemaining(remainingDays);

            if (remainingDays === 0) { // Show evaluation screen only when the trial period has ended.
                setShowEvaluationScreen(true);
            }
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

    const handleGenerate = async (condition: string, discipline: string, difficulty: string) => {
        setError(null);
        setIsLoading(true);
        setLoadingMessage(T.generatingCaseMessage(condition, discipline));
        setPatientCase(null);
        setMapData(null);
        setSelectedNodeInfo(null);
        
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

    const handleNodeClick = useCallback(async (node: KnowledgeNode) => {
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
    }, [patientCase, language, T.errorAbstract, selectedNodeInfo, T.errorService]);
    
    const handleClearNodeSelection = useCallback(() => {
        setSelectedNodeInfo(null);
    }, []);
    
    const handleSaveCase = () => {
        if (!patientCase || !mapData) return;
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
        }
    };
    
    const handleDeleteCase = (caseId: string) => {
        const updatedCases = savedCases.filter(c => c.id !== caseId);
        setSavedCases(updatedCases);
        localStorage.setItem('synapsis_saved_cases', JSON.stringify(updatedCases));
    };

    const handleSaveSnippet = (title: string, content: string) => {
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
        return <EvaluationScreen T={T} />;
    }

    return (
        <div className="flex flex-col h-screen bg-gray-100 font-sans">
            <Header
                supportedLanguages={supportedLanguages}
                currentLanguage={language}
                onLanguageChange={handleLanguageChange}
                T={T}
            />
            
            <main className="flex-grow p-4 md:p-6 overflow-hidden">
                <div className="max-w-7xl mx-auto h-full flex flex-col space-y-4">
                    <ControlPanel
                        onGenerate={handleGenerate}
                        disabled={isLoading}
                        T={T}
                        onSaveCase={handleSaveCase}
                        onOpenSavedWork={() => setIsSavedWorkOpen(true)}
                        onOpenClinicalTools={() => setIsClinicalToolsOpen(true)}
                        isCaseActive={!!patientCase}
                    />
                    
                    <TipsCarousel interactionState={interactionState} T={T} />
                    {error && <ErrorDisplay message={error} />}

                    <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-0 relative">
                        {isLoading && <LoadingOverlay message={loadingMessage} />}
                        
                        {!patientCase && !isLoading && !error && (
                            <div className="lg:col-span-2">
                                <WelcomeScreen T={T} />
                            </div>
                        )}
                        
                        {patientCase && (
                            <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-y-auto">
                                <PatientCaseView 
                                    patientCase={patientCase}
                                    onSave={handlePatientCaseUpdate}
                                    language={language}
                                    T={T}
                                    onSaveSnippet={handleSaveSnippet}
                                    onOpenShare={() => setIsShareModalOpen(true)}
                                />
                            </div>
                        )}
                        
                        {mapData && (
                            <div className={`transition-all duration-500 ease-in-out ${isMapFullscreen ? 'fixed inset-0 z-30' : 'relative min-h-[400px] lg:min-h-0'}`}>
                                <KnowledgeMap
                                    data={mapData}
                                    onNodeClick={handleNodeClick}
                                    selectedNodeInfo={selectedNodeInfo}
                                    onClearSelection={handleClearNodeSelection}
                                    isMapFullscreen={isMapFullscreen}
                                    setIsMapFullscreen={setIsMapFullscreen}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </main>
            
            <Footer T={T} evaluationDaysRemaining={evaluationDaysRemaining} />

            <button
                onClick={() => setIsFeedbackModalOpen(true)}
                className="fixed bottom-16 right-4 bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-full shadow-lg transition duration-300 z-20"
                title={T.feedbackButton}
            >
                {T.feedbackButton}
            </button>

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
