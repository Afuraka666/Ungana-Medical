import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { PatientCaseView } from './components/PatientCaseView';
import { KnowledgeMap } from './components/KnowledgeMap';
import { ConceptCard } from './components/ConceptCard';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ErrorDisplay } from './components/ErrorDisplay';
import { UpdateNotifier } from './components/UpdateNotifier';
import { EvaluationScreen } from './components/EvaluationScreen';
import { generatePatientCaseAndMap, generateKnowledgeMap, getConceptAbstract } from './services/geminiService';
import type { PatientCase, KnowledgeMapData, KnowledgeNode } from './types';
import { translations, supportedLanguages } from './i18n';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [patientCase, setPatientCase] = useState<PatientCase | null>(null);
  const [knowledgeMapData, setKnowledgeMapData] = useState<KnowledgeMapData | null>(null);
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<{ node: KnowledgeNode; abstract: string; loading: boolean } | null>(null);
  const [language, setLanguage] = useState<string>(localStorage.getItem('appLanguage') || 'en');
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null);
  const [isTrialExpired, setIsTrialExpired] = useState<boolean>(false);

  const T = translations[language] || translations.en;

  useEffect(() => {
    localStorage.setItem('appLanguage', language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const TRIAL_DURATION_DAYS = 30;
    const firstLaunchKey = 'synapsis_first_launch_date';
    const storedDate = localStorage.getItem(firstLaunchKey);
    let firstLaunchDate: number;

    if (storedDate) {
        firstLaunchDate = parseInt(storedDate, 10);
    } else {
        firstLaunchDate = new Date().getTime();
        localStorage.setItem(firstLaunchKey, firstLaunchDate.toString());
    }

    const now = new Date().getTime();
    const daysPassed = (now - firstLaunchDate) / (1000 * 3600 * 24);
    
    if (daysPassed > TRIAL_DURATION_DAYS) {
        setIsTrialExpired(true);
        setTrialDaysRemaining(0);
    } else {
        setIsTrialExpired(false);
        setTrialDaysRemaining(Math.ceil(TRIAL_DURATION_DAYS - daysPassed));
    }
  }, []);

  const handleGenerateCase = useCallback(async (condition: string, discipline: string) => {
    setIsLoading(true);
    setError(null);
    setPatientCase(null);
    setKnowledgeMapData(null);
    setSelectedNodeInfo(null);

    try {
      setLoadingMessage(T.generatingCaseMessage(condition, discipline));
      const result = await generatePatientCaseAndMap(condition, discipline, language);
      setLoadingMessage(T.buildingMapMessage);
      
      setTimeout(() => {
        setPatientCase(result.case);
        setKnowledgeMapData(result.mapData);
        setIsLoading(false);
      }, 1500);

    } catch (err) {
      console.error(err);
      setError(T.errorGenerate);
      setIsLoading(false);
    }
  }, [language, T]);
  
  const handleSaveCase = useCallback(async (updatedCase: PatientCase) => {
    setPatientCase(updatedCase);
    setIsLoading(true);
    setLoadingMessage(T.updatingMapMessage);
    setError(null);
    setSelectedNodeInfo(null);

    try {
      const newMapData = await generateKnowledgeMap(updatedCase, language);
      setKnowledgeMapData(newMapData);
    } catch (err) {
      console.error(err);
      setError(T.errorUpdate);
    } finally {
      setIsLoading(false);
    }
  }, [language, T]);

  const handleNodeClick = useCallback(async (node: KnowledgeNode) => {
    if (selectedNodeInfo?.node.id === node.id) {
        setSelectedNodeInfo(null); // Deselect if clicking the same node
        return;
    }
    
    setSelectedNodeInfo({ node, abstract: '', loading: true });
    try {
        if (!patientCase) throw new Error("Patient case not available.");
        const abstract = await getConceptAbstract(node.label, patientCase.title, language);
        setSelectedNodeInfo({ node, abstract, loading: false });
    } catch (err) {
        console.error("Failed to get concept abstract", err);
        setSelectedNodeInfo({ node, abstract: T.errorAbstract, loading: false });
    }
  }, [patientCase, language, T, selectedNodeInfo]);
  
  const handleClearSelection = useCallback(() => {
    setSelectedNodeInfo(null);
  }, []);

  if (isTrialExpired) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 font-sans text-brand-text">
        <Header
          supportedLanguages={supportedLanguages}
          currentLanguage={language}
          onLanguageChange={setLanguage}
          T={T}
        />
        <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8">
          <EvaluationScreen T={T} />
        </main>
        <footer className="text-center py-4 text-sm text-gray-500 border-t border-gray-200 bg-gray-50">
          <p>&copy; {new Date().getFullYear()} Samuel Sibanda. All rights reserved.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 font-sans text-brand-text">
      <Header 
        supportedLanguages={supportedLanguages}
        currentLanguage={language}
        onLanguageChange={setLanguage}
        T={T}
      />
      <main className="flex-grow flex flex-col p-4 md:p-6 lg:p-8">
        <ControlPanel onGenerate={handleGenerateCase} disabled={isLoading} T={T} />
        {error && <ErrorDisplay message={error} />}
        
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 min-h-0">
          
          {!isLoading && !patientCase && !error && (
             <div className="lg:col-span-12 h-full">
                <WelcomeScreen T={T} />
             </div>
          )}
          
          {patientCase && knowledgeMapData && (
            <>
              <div className={`lg:col-span-4 min-h-0 animate-fade-in max-h-[70vh] lg:max-h-full h-full overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 ${isMapFullscreen ? 'hidden lg:block' : ''}`}>
                <PatientCaseView patientCase={patientCase} onSave={handleSaveCase} language={language} T={T} />
              </div>
              <div className={`flex-grow relative animate-fade-in min-h-[500px] lg:min-h-0 ${isMapFullscreen ? 'lg:col-span-12' : 'lg:col-span-8'}`} style={{ animationDelay: '200ms' }}>
                {isLoading && <LoadingOverlay message={loadingMessage} />}
                <KnowledgeMap 
                  data={knowledgeMapData} 
                  onNodeClick={handleNodeClick} 
                  selectedNodeId={selectedNodeInfo?.node.id || null}
                  onClearSelection={handleClearSelection}
                  isMapFullscreen={isMapFullscreen}
                  setIsMapFullscreen={setIsMapFullscreen}
                />
                {selectedNodeInfo && !isMapFullscreen && (
                  <ConceptCard 
                    nodeInfo={selectedNodeInfo} 
                    onClose={handleClearSelection}
                  />
                )}
              </div>
            </>
          )}
           {isLoading && patientCase === null && (
                <div className="lg:col-span-12 relative min-h-[400px]">
                    <LoadingOverlay message={loadingMessage} />
                </div>
           )}
        </div>
      </main>
      <UpdateNotifier />
      <footer className="text-center py-4 text-sm text-gray-500 border-t border-gray-200 bg-gray-50">
        {trialDaysRemaining !== null && (
            <p className="font-semibold text-brand-blue mb-1">{T.trialDaysRemaining(trialDaysRemaining)}</p>
        )}
        <p>&copy; {new Date().getFullYear()} Samuel Sibanda. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default App;