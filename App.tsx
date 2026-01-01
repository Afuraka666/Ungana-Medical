
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

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
    generateExtendedDetails,
    generateEvidenceAndQuiz,
    generateKnowledgeMap,
    getConceptAbstract
} from './services/geminiService';

// Types
import type { PatientCase, KnowledgeMapData, KnowledgeNode, SavedCase, Snippet, InteractionState, DisciplineSpecificConsideration, ChatMessage } from './types';

// i18n
import { translations, supportedLanguages } from './i18n';

// Hooks
import { useAnalytics } from './contexts/analytics';

// Helper: Decompresses a URL-safe Base64 string back into a JSON object
async function decodeAndDecompress(encodedString: string): Promise<any | null> {
    try {
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

export const App: React.FC = () => {
    const { logEvent } = useAnalytics();

    // Core App State
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingDetails, setIsGeneratingDetails] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [patientCase, setPatientCase] = useState<PatientCase | null>(null);
    const [mapData, setMapData] = useState<KnowledgeMapData | null>(null);

    // Theme State - Initialize with stored preference or system default
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('ungana_theme');
        if (saved) return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    // Knowledge Map State
    const [selectedNodeInfo, setSelectedNodeInfo] = useState<{ node: KnowledgeNode; abstract: string; loading: boolean } | null>(null);
    const [isMapFullscreen, setIsMapFullscreen] = useState(false);
    const knowledgeMapRef = useRef<{ captureAsImage: () => Promise<string> } | null>(null);

    // Internationalization State
    const [language, setLanguage] = useState(localStorage.getItem('ungana_language') || 'en');

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
    
    const [generationCount, setGenerationCount] = useState(0);
    const [showEvaluationScreen, setShowEvaluationScreen] = useState(false);
    const [evaluationDaysRemaining, setEvaluationDaysRemaining] = useState<number | null>(null);
    const [mobileView, setMobileView] = useState<'case' | 'map'>('case');
    const [isUiVisible, setIsUiVisible] = useState(true);
    const lastScrollTop = useRef(0);
    const caseScrollRef = useRef<HTMLDivElement>(null);

    const T = useMemo(() => {
        const selectedTranslation = translations[language];
        if (!selectedTranslation) return translations.en;
        return { ...translations.en, ...selectedTranslation };
    }, [language]);
    
    // -- EFFECTS --

    // Apply theme class
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('ungana_theme', theme);
    }, [theme]);

    // MIGRATION Logic
    useEffect(() => {
        try {
            if (!localStorage.getItem('ungana_language') && localStorage.getItem('synapsis_language')) {
                localStorage.setItem('ungana_language', localStorage.getItem('synapsis_language')!);
                setLanguage(localStorage.getItem('synapsis_language')!);
            }
            if (!localStorage.getItem('ungana_saved_cases') && localStorage.getItem('synapsis_saved_cases')) {
                localStorage.setItem('ungana_saved_cases', localStorage.getItem('synapsis_saved_cases')!);
            }
            if (!localStorage.getItem('ungana_saved_snippets') && localStorage.getItem('synapsis_saved_snippets')) {
                localStorage.setItem('ungana_saved_snippets', localStorage.getItem('synapsis_saved_snippets')!);
            }
            if (!localStorage.getItem('ungana_generation_count') && localStorage.getItem('synapsis_generation_count')) {
                localStorage.setItem('ungana_generation_count', localStorage.getItem('synapsis_generation_count')!);
            }
            document.title = "Ungana Medical";
        } catch (e) {
            console.error("Migration error:", e);
        }
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('case')) return;
        try {
            const trialStartDateStr = localStorage.getItem('ungana_trial_start_date');
            const hasSubmitted = localStorage.getItem('ungana_feedback_submitted') === 'true';
            let trialStartDate: Date;
            if (trialStartDateStr) {
                trialStartDate = new Date(trialStartDateStr);
            } else {
                trialStartDate = new Date();
                localStorage.setItem('ungana_trial_start_date', trialStartDate.toISOString());
            }
            const now = new Date();
            const timeDiff = now.getTime() - trialStartDate.getTime();
            const daysElapsed = Math.floor(timeDiff / (1000 * 3600 * 24));
            const daysRemaining = 30 - daysElapsed;
            setEvaluationDaysRemaining(daysRemaining);
            if (daysRemaining <= 0 && !hasSubmitted) setShowEvaluationScreen(true);
        } catch (e) { console.error("Failed to process evaluation status", e); }
    }, []);
    
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('case')) return;
        try {
            const cases = JSON.parse(localStorage.getItem('ungana_saved_cases') || '[]');
            const snippets = JSON.parse(localStorage.getItem('ungana_saved_snippets') || '[]');
            const count = parseInt(localStorage.getItem('ungana_generation_count') || '0', 10);
            setSavedCases(cases);
            setSavedSnippets(snippets);
            setGenerationCount(count);
        } catch (e) { console.error("Failed to load data from localStorage", e); }
    }, []);
    
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const caseDataParam = urlParams.get('case');
        if (caseDataParam) {
            setIsLoading(true);
            setLoadingMessage('Loading shared case...');
            decodeAndDecompress(caseDataParam).then(decodedCase => {
                if (decodedCase) {
                    setPatientCase(decodedCase as PatientCase);
                    setMapData(null); 
                } else {
                    setError('Failed to load the shared case. The link might be invalid.');
                }
                setIsLoading(false);
                window.history.replaceState({}, document.title, window.location.pathname);
            });
        }
    }, []);

    // -- HANDLERS --
    
    const handleCaseScroll = useCallback(() => {
        if (!caseScrollRef.current) return;
        const { scrollTop } = caseScrollRef.current;
        if (Math.abs(scrollTop - lastScrollTop.current) < 20) return;
        if (scrollTop > lastScrollTop.current && scrollTop > 150) {
            setIsUiVisible(false);
        } else if (scrollTop < lastScrollTop.current || scrollTop < 50) {
            setIsUiVisible(true);
        }
        lastScrollTop.current = scrollTop <= 0 ? 0 : scrollTop;
    }, []);
    
    const handleLanguageChange = (langCode: string) => {
        setLanguage(langCode);
        localStorage.setItem('ungana_language', langCode);
    };

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const handleFeedbackSubmitted = () => {
        localStorage.setItem('ungana_feedback_submitted', 'true');
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
            const coreCase = await generateCorePatientCase(condition, discipline, difficulty, language);
            setPatientCase(coreCase);
            setIsLoading(false);
            setIsGeneratingDetails(true);
            setGenerationCount(prev => {
                const count = prev + 1;
                localStorage.setItem('ungana_generation_count', String(count));
                return count;
            });
            
            const promises = [
                generateExtendedDetails(coreCase, discipline, difficulty, language).then(res => {
                    setPatientCase(prev => prev ? { ...prev, ...res } : null);
                }),
                generateEvidenceAndQuiz(coreCase, discipline, difficulty, language).then(res => {
                    setPatientCase(prev => prev ? { ...prev, ...res } : null);
                }),
                generateKnowledgeMap(coreCase, discipline, difficulty, language).then(res => {
                    setMapData(res);
                })
            ];
            await Promise.allSettled(promises);
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
        setSelectedNodeInfo({ node, abstract: node.summary, loading: false });
        setInteractionState(prev => ({...prev, nodeClicks: prev.nodeClicks + 1}));
    }, [selectedNodeInfo, logEvent]);
    
    const handleClearNodeSelection = useCallback(() => setSelectedNodeInfo(null), []);
    
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
        localStorage.setItem('ungana_saved_cases', JSON.stringify(updatedCases));
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
        localStorage.setItem('ungana_saved_cases', JSON.stringify(updatedCases));
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
        localStorage.setItem('ungana_saved_snippets', JSON.stringify(updatedSnippets));
        setInteractionState(prev => ({ ...prev, snippetSaved: true }));
    };
    
    const handleDeleteSnippet = (snippetId: string) => {
        const updatedSnippets = savedSnippets.filter(s => s.id !== snippetId);
        setSavedSnippets(updatedSnippets);
        localStorage.setItem('ungana_saved_snippets', JSON.stringify(updatedSnippets));
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

    if (showEvaluationScreen) return <EvaluationScreen T={T} onFeedbackSubmitted={handleFeedbackSubmitted} />;
    
    return (
        <div className="flex flex-col h-[100dvh] bg-gray-100 dark:bg-dark-bg font-sans transition-colors duration-300">
            <Header
                supportedLanguages={supportedLanguages}
                currentLanguage={language}
                onLanguageChange={handleLanguageChange}
                currentTheme={theme}
                onThemeToggle={toggleTheme}
                T={T}
                className={`sticky top-0 z-30 transition-transform duration-300 ${!isUiVisible && patientCase ? '-translate-y-full' : 'translate-y-0'}`}
            />
            
            <main className="flex-grow p-2 sm:p-4 overflow-hidden relative">
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
                        mobileView={mobileView}
                        onSetMobileView={setMobileView}
                    />

                    <div className="hidden md:block">
                        <TipsCarousel interactionState={interactionState} T={T} />
                    </div>
                    
                    {patientCase ? (
                        <div className="flex-grow overflow-hidden h-full relative">
                            <div 
                                className="flex h-full w-full transition-transform duration-300 ease-in-out lg:transform-none lg:flex-row lg:gap-4 absolute inset-0"
                                style={{ transform: `translateX(${mobileView === 'map' ? '-100%' : '0%'})` }}
                            >
                                <div className="w-full flex-shrink-0 h-full lg:w-3/5 lg:flex-shrink">
                                    <div ref={caseScrollRef} onScroll={handleCaseScroll} className="h-full overflow-y-auto bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-dark-border">
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
                                <div className="w-full flex-shrink-0 h-full flex flex-col lg:w-2/5 lg:flex-shrink">
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
                                        <div className="w-full h-full flex items-center justify-center bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-dark-border p-8 text-center text-dark-text">
                                            <LoadingOverlay message={T.buildingMapMessage} subMessages={[]} />
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : (
                        !isLoading && <WelcomeScreen 
                                        T={T} 
                                        onOpenSavedWork={() => setIsSavedWorkOpen(true)}
                                        onOpenClinicalTools={() => setIsClinicalToolsOpen(true)}
                                      />
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
                    topicId={activeDiscussionTopic.aspect}
                    caseTitle={patientCase?.title || 'this case'}
                    language={language}
                    T={T}
                    initialHistory={patientCase?.discussions?.[activeDiscussionTopic.aspect]}
                    onSaveDiscussion={(topicId, messages) => {
                        if (patientCase) {
                            const updatedDiscussions = { ...(patientCase.discussions || {}), [topicId]: messages };
                            handlePatientCaseUpdate({ ...patientCase, discussions: updatedDiscussions });
                        }
                    }}
                />
            )}

            <Footer
                T={T}
                evaluationDaysRemaining={evaluationDaysRemaining}
                onOpenFeedback={() => setIsFeedbackModalOpen(true)}
                className={`sticky bottom-0 z-20 transition-transform duration-300 ${!isUiVisible && patientCase ? 'translate-y-full' : 'translate-y-0'}`}
            />
            <UpdateNotifier />
        </div>
    );
};
