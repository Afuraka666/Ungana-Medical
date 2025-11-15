
import React, { useState, useEffect, useRef } from 'react';
import type { DisciplineSpecificConsideration } from '../types';
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { retryWithBackoff } from '../services/geminiService';

interface DiscussionModalProps {
    isOpen: boolean;
    onClose: () => void;
    topic: DisciplineSpecificConsideration;
    caseTitle: string;
    language: string;
    T: Record<string, any>;
}

interface ChatMessage {
    role: 'user' | 'model' | 'system';
    text: string;
}

const LoadingSpinner: React.FC = () => (
    <div className="flex space-x-1.5">
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
    </div>
);

export const DiscussionModal: React.FC<DiscussionModalProps> = ({ isOpen, onClose, topic, caseTitle, language, T }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatRef = useRef<Chat | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            const systemInstruction = `You are an expert medical tutor. A student is reviewing a patient case about "${caseTitle}". They want to discuss the following management consideration: "(${topic.aspect}) ${topic.consideration}". Your role is to facilitate a deep, Socratic discussion. Answer their questions clearly, challenge their understanding, and help them explore alternatives and rationale. Keep your responses concise and educational. When providing factual information or clinical guidance, you MUST cite traceable, high-quality evidence (e.g., from systematic reviews, RCTs, or major clinical guidelines). Use a clear citation format like '[Source: JAMA 2023]'. Respond in the following language: ${language}.`;
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            chatRef.current = ai.chats.create({
              model: 'gemini-2.5-flash',
              config: { systemInstruction },
            });
            
            setMessages([{ role: 'system', text: T.chatWelcomeMessage }]);
        } else {
            // Reset on close
            setMessages([]);
            setUserInput('');
            setIsLoading(false);
            chatRef.current = null;
        }
    }, [isOpen, topic, caseTitle, language, T]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || !chatRef.current) return;

        const newUserMessage: ChatMessage = { role: 'user', text: userInput };
        setMessages(prev => [...prev, newUserMessage]);
        setUserInput('');
        setIsLoading(true);
        
        try {
            const result = await retryWithBackoff<AsyncIterable<GenerateContentResponse>>(() => chatRef.current!.sendMessageStream({ message: userInput }));
            
            let currentResponse = '';
            setMessages(prev => [...prev, { role: 'model', text: '' }]);

            for await (const chunk of result) {
                currentResponse += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { role: 'model', text: currentResponse };
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[95vh] sm:max-h-[80vh] flex flex-col">
                <header className="p-4 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-bold text-gray-800">{T.discussionTitle}</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 font-semibold">{topic.aspect}</p>
                    <p className="text-xs text-gray-500 mt-1">{topic.consideration}</p>
                </header>
                
                <main className="p-4 overflow-y-auto flex-grow bg-gray-50/50">
                    <div className="space-y-4">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'model' && <div className="w-6 h-6 bg-brand-blue text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">AI</div>}
                                <div className={`max-w-xs md:max-w-sm px-4 py-2 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-brand-blue text-white rounded-br-none' : msg.role === 'model' ? 'bg-gray-200 text-brand-text rounded-bl-none' : 'text-center w-full text-gray-500 italic'}`}>
                                    {msg.text}
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

                <footer className="p-4 border-t border-gray-200">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-3">
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
                </footer>
            </div>
        </div>
    );
};
