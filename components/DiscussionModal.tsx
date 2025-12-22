
import React, { useState, useEffect, useRef } from 'react';
import type { DisciplineSpecificConsideration, ChatMessage } from '../types';
import { GoogleGenAI, Chat, GenerateContentResponse, Content } from "@google/genai";
import { retryWithBackoff, generateDiagramForDiscussion } from '../services/geminiService';
import { InteractiveDiagram } from './InteractiveDiagram';
import { MarkdownRenderer } from './MarkdownRenderer';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

// Helper to map app language to BCP-47 for speech recognition
const getBCP47Language = (lang: string): string => {
    const map: Record<string, string> = {
        'en': 'en-US',
        'es': 'es-ES',
        'fr': 'fr-FR',
        'zh': 'zh-CN',
        'hi': 'hi-IN',
        'sw': 'sw-KE',
        'ar': 'ar-SA',
        'pt': 'pt-PT',
        'ru': 'ru-RU',
        'el': 'el-GR',
    };
    // Fallback to English for languages where standard speech engines might not have a locale
    return map[lang] || 'en-US';
};

interface DiscussionModalProps {
    isOpen: boolean;
    onClose: () => void;
    topic: DisciplineSpecificConsideration;
    topicId: string;
    caseTitle: string;
    language: string;
    T: Record<string, any>;
    initialHistory?: ChatMessage[];
    onSaveDiscussion: (topicId: string, messages: ChatMessage[]) => void;
}

const LoadingSpinner: React.FC = () => (
    <div className="flex space-x-1.5">
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
    </div>
);

export const DiscussionModal: React.FC<DiscussionModalProps> = ({ 
    isOpen, onClose, topic, topicId, caseTitle, language, T, initialHistory, onSaveDiscussion 
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
    const [diagramPrompt, setDiagramPrompt] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const chatRef = useRef<Chat | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const shareMenuRef = useRef<HTMLDivElement | null>(null);

    // Voice Input State
    const [isListening, setIsListening] = useState(false);
    const [micError, setMicError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (isOpen) {
            const systemInstruction = `You are an expert medical tutor. A student is reviewing a patient case about "${caseTitle}". They want to discuss the following management consideration: "(${topic.aspect}) ${topic.consideration}". Your role is to facilitate a deep, Socratic discussion. Answer their questions clearly, challenge their understanding, and help them explore alternatives and rationale. Keep your responses concise and educational.
            
            **Guideline:** When discussing concepts, equations, graphs, and diagrams, examples from traceable references may be used to enhance clarification. If there is synthesis of any of the above mentioned, the bases (evidence) must be provided and a synthesis label (e.g., "[Synthesis]") must be attached to the synthesised item.

            **Molecular Formulas & Notations:** 
            Always use Unicode subscript characters (e.g., ₀, ₁, ₂, ₃, ⁴, ₅, ₆, ₇, ₈, ₉) and superscript characters (e.g., ⁰, ¹, ², ³, ⁴, ⁵, ⁶, ⁷, ⁸, ⁹, ⁺, ⁻) for all formulas. 
            - Examples: CO₂, SpO₂, SaO₂, H₂O, C₆H₁₂O₆, Na⁺, Cl⁻, Ca²⁺, HCO₃⁻, PO₄³⁻. 
            - **CRITICAL:** DO NOT use LaTeX symbols ($), math mode, or markdown bolding for chemical/molecular/clinical formulas. Use plain text with Unicode subscripts/superscripts only.

            **Formatting:** Use standard LaTeX formatting for complex mathematical equations, formulas, and physics concepts ONLY.
            - Inline math: Enclose in single dollar signs, e.g., $E = mc^2$.
            - Block math: Enclose in double dollar signs.

            When providing factual information or clinical guidance, you MUST cite traceable, high-quality evidence (e.g., from systematic reviews, RCTs, or major clinical guidelines). Use a clear citation format like '[Source: JAMA 2023]'. Respond in the following language: ${language}.`;
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            let chatHistory: Content[] | undefined = undefined;

            // Restore history if provided
            if (initialHistory && initialHistory.length > 0) {
                setMessages(initialHistory);
                chatHistory = initialHistory
                    .filter(m => m.role === 'user' || m.role === 'model')
                    .map(m => ({
                        role: m.role as 'user' | 'model',
                        parts: [{ text: m.text }]
                    }));
                setIsSaved(true);
            } else {
                setMessages([{ role: 'system', text: T.chatWelcomeMessage }]);
                setIsSaved(false);
            }

            chatRef.current = ai.chats.create({
              model: 'gemini-3-pro-preview',
              config: { 
                  systemInstruction,
                  thinkingConfig: { thinkingBudget: 32768 }
              },
              history: chatHistory
            });
            
        } else {
            // Reset on close
            chatRef.current = null;
            setIsSaved(false);
            setShowShareMenu(false);
            setMicError(null);
            if (recognitionRef.current) recognitionRef.current.abort();
        }
    }, [isOpen, topic, caseTitle, language, T, initialHistory, topicId]);

    // STT Initialization
    useEffect(() => {
        if (!isSpeechRecognitionSupported) return;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onstart = () => {
            setIsListening(true);
            setMicError(null);
        };
        
        recognition.onend = () => {
            setIsListening(false);
        };
        
        recognition.onerror = (event: any) => {
            console.error('Discussion Mic Error:', event.error);
            // 'not-allowed' means permission denied or blocked by policy
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                setMicError(T.micPermissionError);
            } else {
                setMicError(T.micGenericError);
            }
            setIsListening(false);
        };

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setUserInput(prev => (prev ? `${prev} ${transcript}` : transcript));
        };
        
        recognitionRef.current = recognition;
    }, [T.micPermissionError, T.micGenericError]);

    const handleMicClick = () => {
        if (!recognitionRef.current) return;
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            setMicError(null);
            try {
                // SpeechRecognition directly handles the permission prompt upon .start()
                // in standard browser environments. Calling getUserMedia beforehand 
                // can sometimes create a hardware lock race condition.
                recognitionRef.current.lang = getBCP47Language(language);
                recognitionRef.current.start();
            } catch (err: any) {
                console.error("Mic start failed:", err);
                setMicError(T.micGenericError);
            }
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Close share menu on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (shareMenuRef.current && !shareMenuRef.current.contains(event.target as Node)) {
                setShowShareMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || !chatRef.current) return;

        const newUserMessage: ChatMessage = { role: 'user', text: userInput, timestamp: Date.now() };
        setMessages(prev => [...prev, newUserMessage]);
        setUserInput('');
        setIsLoading(true);
        setIsSaved(false); // Unsaved changes
        
        try {
            const result = await retryWithBackoff<AsyncIterable<GenerateContentResponse>>(() => chatRef.current!.sendMessageStream({ message: userInput }));
            
            let currentResponse = '';
            setMessages(prev => [...prev, { role: 'model', text: '', timestamp: Date.now() }]);

            for await (const chunk of result) {
                currentResponse += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { role: 'model', text: currentResponse, timestamp: Date.now() };
                    return newMessages;
                });
            }
        } catch (error: any) {
            console.error("Chat error:", error);
            if (error.message && (error.message.includes("API key not valid") || error.message.includes("Requested entity was not found") || error.message.includes("API_KEY"))) {
                setMessages(prev => [...prev, { role: 'system', text: T.errorService }]);
            } else {
                setMessages(prev => [...prev, { role: 'system', text: T.errorChat }]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateDiagram = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!diagramPrompt.trim() || isLoading) return;
    
        const chatContext = messages.map(m => `${m.role}: ${m.text}`).join('\n');
        const userRequestMessage: ChatMessage = { role: 'system', text: `(Generating diagram: "${diagramPrompt}")` };
    
        setMessages(prev => [...prev, userRequestMessage]);
        setIsLoading(true);
        setIsGeneratingDiagram(false);
        
        try {
            const diagramData = await generateDiagramForDiscussion(diagramPrompt, chatContext, language);
            const diagramMessage: ChatMessage = {
                role: 'model',
                text: `Here is a diagram illustrating "${diagramPrompt}":`,
                diagramData: diagramData,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, diagramMessage]);
            setDiagramPrompt(''); // Clear prompt on success
            setIsSaved(false);
        } catch (error) {
            console.error("Diagram generation error:", error);
            setMessages(prev => [...prev, { role: 'system', text: "Sorry, I couldn't generate that diagram. Please try a different description." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = () => {
        onSaveDiscussion(topicId, messages);
        setIsSaved(true);
    };

    const formatTranscript = () => {
        const header = `Discussion Topic: ${topic.aspect}\nContext: ${topic.consideration}\nDate: ${new Date().toLocaleDateString()}\n\n`;
        const body = messages
            .filter(m => m.role !== 'system') 
            .map(m => {
                const speaker = m.role === 'user' ? 'Student' : 'AI Tutor';
                return `[${speaker}]: ${m.text}`;
            })
            .join('\n\n');
        return header + body;
    };

    const handleCopyTranscript = () => {
        const text = formatTranscript();
        navigator.clipboard.writeText(text).then(() => {
            alert(T.transcriptCopied);
            setShowShareMenu(false);
        });
    };

    const handleDownloadTranscript = () => {
        const text = formatTranscript();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Discussion_${topic.aspect.replace(/\s+/g, '_').substring(0, 20)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShowShareMenu(false);
    };

    const handleNativeShare = () => {
        const text = formatTranscript();
        if (navigator.share) {
            navigator.share({
                title: `Discussion: ${topic.aspect}`,
                text: text,
            }).catch(console.error);
        }
        setShowShareMenu(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[90vh] sm:h-[85vh] flex flex-col">
                <header className="p-4 border-b border-gray-200 bg-white rounded-t-xl z-10">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-bold text-gray-800">{T.discussionTitle}</h2>
                        <div className="flex items-center gap-2">
                            {initialHistory && initialHistory.length > 0 && (
                                <span className="hidden sm:inline-block text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium border border-green-100">
                                    History Restored
                                </span>
                            )}
                            
                            <div className="relative" ref={shareMenuRef}>
                                <button 
                                    onClick={() => setShowShareMenu(!showShareMenu)}
                                    className="p-1.5 text-gray-500 hover:text-brand-blue hover:bg-gray-100 rounded-full transition"
                                    title={T.shareDiscussion}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                    </svg>
                                </button>
                                {showShareMenu && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-20 animate-fade-in">
                                        <ul className="py-1">
                                            <li>
                                                <button onClick={handleCopyTranscript} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                                                    {T.copyTranscript}
                                                </button>
                                            </li>
                                            <li>
                                                <button onClick={handleDownloadTranscript} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                                    {T.downloadTranscript}
                                                </button>
                                            </li>
                                            {navigator.share && (
                                                <li>
                                                    <button onClick={handleNativeShare} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                                                        {T.shareNative}
                                                    </button>
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 font-semibold truncate">{topic.aspect}</p>
                    <p className="text-xs text-gray-500 mt-1 truncate">{topic.consideration}</p>
                </header>
                
                <main className="p-4 overflow-y-auto flex-grow bg-gray-50/50">
                    <div className="space-y-4 pb-2">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'model' && <div className="w-6 h-6 bg-brand-blue text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">AI</div>}
                                <div className={`max-w-xs md:max-w-sm px-4 py-2 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-brand-blue text-white rounded-br-none' : msg.role === 'model' ? 'bg-gray-200 text-brand-text rounded-bl-none' : 'text-center w-full text-gray-500 italic'}`}>
                                    {msg.role === 'model' ? (
                                        <MarkdownRenderer content={msg.text} />
                                    ) : (
                                        <p className="whitespace-pre-wrap">{msg.text}</p>
                                    )}
                                     {msg.diagramData && (
                                        <div className="mt-2 h-64 w-full rounded-lg border border-gray-300 bg-white">
                                            <InteractiveDiagram data={msg.diagramData} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex items-end gap-2 justify-start">
                                <div className="w-6 h-6 bg-brand-blue text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">AI</div>
                                <div className="px-4 py-3 bg-gray-200 rounded-2xl rounded-bl-none">
                                    <LoadingSpinner />
                                </div>
                            </div>
                        )}
                         <div ref={messagesEndRef} />
                    </div>
                </main>

                <footer className="p-4 border-t border-gray-200 bg-white rounded-b-xl z-10">
                    {micError && (
                        <div className="mb-2 text-xs text-red-600 flex items-start gap-1 bg-red-50 p-2 rounded border border-red-100 animate-fade-in">
                            <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
                            <span className="leading-tight">{micError}</span>
                        </div>
                    )}
                    {isGeneratingDiagram && (
                        <form onSubmit={handleGenerateDiagram} className="p-2 border border-gray-200 rounded-lg mb-2 bg-gray-50 animate-fade-in">
                            <label htmlFor="diagram-prompt" className="text-xs font-semibold text-gray-600">Describe the diagram or graph you want to see:</label>
                            <div className="flex items-center gap-2 mt-1">
                                <input
                                    id="diagram-prompt"
                                    type="text"
                                    value={diagramPrompt}
                                    onChange={(e) => setDiagramPrompt(e.target.value)}
                                    placeholder={T.diagramPlaceholder}
                                    className="flex-grow p-1.5 border border-gray-300 rounded-md text-sm text-black"
                                    autoFocus
                                />
                                <button type="submit" disabled={isLoading || !diagramPrompt.trim()} className="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded-md transition text-sm disabled:bg-gray-400">
                                    Generate
                                </button>
                                 <button type="button" onClick={() => setIsGeneratingDiagram(false)} className="text-gray-500 hover:text-gray-700 text-sm">
                                    {T.cancelButton}
                                </button>
                            </div>
                        </form>
                    )}
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 mb-3">
                         <button
                            type="button"
                            onClick={() => setIsGeneratingDiagram(prev => !prev)}
                            disabled={isLoading}
                            title="Generate a diagram"
                            className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-600 transition disabled:bg-gray-200 disabled:cursor-not-allowed flex-shrink-0"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                            </svg>
                        </button>
                        {isSpeechRecognitionSupported && (
                            <button
                                type="button"
                                onClick={handleMicClick}
                                disabled={isLoading}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-md border transition flex-shrink-0 ${isListening ? 'text-red-500 border-red-500 bg-red-50 animate-pulse shadow-inner' : 'text-gray-600 border-gray-300 bg-white hover:bg-gray-100 shadow-sm'}`}
                                title="Speech to Text"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm-1 4a4 4 0 108 0V4a4 4 0 10-8 0v4zM2 11a1 1 0 011-1h1a1 1 0 011 1v.5a.5.5 0 001 0V11a3 3 0 013-3h0a3 3 0 013 3v.5a.5.5 0 001 0V11a1 1 0 011 1h1a1 1 0 110 2h-1a1 1 0 01-1-1v-.5a2.5 2.5 0 00-5 0v.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" clipRule="evenodd" />
                                </svg>
                                <span className="hidden sm:inline text-xs font-bold uppercase tracking-tight">Voice</span>
                            </button>
                        )}
                        <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder={T.chatPlaceholder}
                            disabled={isLoading}
                            className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition w-full bg-gray-50 text-black"
                        />
                        <button type="submit" disabled={isLoading || !userInput.trim()} className="bg-brand-blue hover:bg-blue-800 text-white font-bold p-2 rounded-md transition disabled:bg-gray-400 disabled:cursor-not-allowed flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.428A1 1 0 0010 16h.008a1 1 0 00.724-.316l5-5a1 1 0 00.316-.724V4a1 1 0 00-1-1h-2a1 1 0 00-1 1v.008a1 1 0 00.316.724l-3 3.428z" />
                            </svg>
                        </button>
                    </form>
                    <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                        <span className="text-xs text-gray-400 italic">
                            {isSaved ? "Discussion saved to case." : "Unsaved discussion."}
                        </span>
                        <button 
                            type="button"
                            onClick={handleSave}
                            disabled={isLoading}
                            className={`text-xs px-4 py-2 rounded-md transition font-medium border flex items-center gap-1 shadow-sm ${isSaved ? 'text-green-700 bg-green-50 border-green-200' : 'text-brand-blue bg-blue-50 hover:bg-blue-100 border-blue-200'}`}
                        >
                            {isSaved ? (
                                <>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    Saved
                                </>
                            ) : (
                                <>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                                    Save Discussion
                                </>
                            )}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};
