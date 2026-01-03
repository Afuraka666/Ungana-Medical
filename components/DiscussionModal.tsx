
import React, { useState, useEffect, useRef } from 'react';
import type { DisciplineSpecificConsideration, ChatMessage, DiagramData, EducationalContent } from '../types';
import { EducationalContentType } from '../types';
import { GoogleGenAI, Chat, GenerateContentResponse, Content } from "@google/genai";
import { retryWithBackoff, generateDiagramForDiscussion } from '../services/geminiService';
import { InteractiveDiagram } from './InteractiveDiagram';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ImageGenerator } from './ImageGenerator';
import { SourceRenderer } from './SourceRenderer';
import { ScientificGraph } from './ScientificGraph';
import { AudioVisualizer } from './AudioVisualizer';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

const GRAPH_TITLES: Record<string, string> = {
    'oxygen_dissociation': 'Hemoglobin-Oxygen Dissociation Curve',
    'frank_starling': 'Frank-Starling Relationship Model',
    'pressure_volume_loop': 'Left Ventricular Pressure-Volume Loop',
    'cerebral_pressure_volume': 'Monro-Kellie Intracranial Relationship',
    'cerebral_autoregulation': 'Cerebral Blood Flow Autoregulation Curve'
};

const getBCP47Language = (lang: string): string => {
    const map: Record<string, string> = {
        'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'zh': 'zh-CN', 'hi': 'hi-IN',
        'sw': 'sw-KE', 'sn': 'sn-ZW', 'nd': 'nd-ZW', 'bem': 'en-ZM', 'ny': 'ny-MW',
        'ar': 'ar-SA', 'pt': 'pt-PT', 'ru': 'ru-RU', 'tn': 'tn-ZA', 'el': 'el-GR',
    };
    return map[lang] || 'en-US';
};

/**
 * Capture an SVG element as a high-fidelity PNG base64 string
 */
const captureSvgAsBase64 = async (svgElement: SVGSVGElement): Promise<string> => {
    return new Promise((resolve) => {
        const xml = new XMLSerializer().serializeToString(svgElement);
        const svg64 = btoa(unescape(encodeURIComponent(xml)));
        const b64Start = 'data:image/svg+xml;base64,';
        const image64 = b64Start + svg64;
        
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 2; // High DPI capture
            canvas.width = svgElement.clientWidth * scale;
            canvas.height = svgElement.clientHeight * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(scale, scale);
                ctx.fillStyle = "white"; // Ensure white background for PDF
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png', 1.0));
            } else resolve('');
        };
        img.src = image64;
    });
};

const cleanTextForDownload = (text: string): string => {
    return text
        .replace(/\[ILLUSTRATE:.*?\]/g, '')
        .replace(/\[DIAGRAM:.*?\]/g, '')
        .replace(/\[GRAPH:.*?\]/g, '')
        .replace(/\\\$/g, '$')
        .replace(/\$\\/g, '')
        .replace(/\\/g, '') 
        .replace(/\bPaO2\b/g, 'PaO₂')
        .replace(/\bSaO2\b/g, 'SaO₂')
        .replace(/\bPvO2\b/g, 'PvO₂')
        .replace(/\bCO2\b/g, 'CO₂')
        .replace(/\bO2\b/g, 'O₂')
        .replace(/\bH2O\b/g, 'H₂O')
        .replace(/\bt1\/2\b/gi, 'T½')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/#/g, '')
        .trim();
};

function parseMarkdownTable(text: string) {
    const lines = text.trim().split('\n');
    if (lines.length < 3) return null;
    const rows = lines
        .filter(line => line.trim().startsWith('|'))
        .map(line => line.split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim()));
    if (rows.length < 2) return null;
    const header = rows[0];
    const data = rows.slice(2);
    if (header.length === 0) return null;
    return { header, data };
}

function splitMessageContent(text: string) {
    const parts: {type: 'text' | 'table', content?: string, table?: {header: string[], data: string[][]}}[] = [];
    const lines = text.split('\n');
    let currentText = '';
    let inTable = false;
    let tableLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isTableRow = line.trim().startsWith('|');

        if (isTableRow) {
            if (!inTable) {
                if (currentText.trim()) parts.push({type: 'text', content: currentText.trim()});
                currentText = '';
                inTable = true;
                tableLines = [line];
            } else {
                tableLines.push(line);
            }
        } else {
            if (inTable) {
                const table = parseMarkdownTable(tableLines.join('\n'));
                if (table) parts.push({type: 'table', table});
                else currentText += (currentText ? '\n' : '') + tableLines.join('\n');
                inTable = false;
                tableLines = [];
            }
            currentText += (currentText ? '\n' : '') + line;
        }
    }
    if (inTable) {
        const table = parseMarkdownTable(tableLines.join('\n'));
        if (table) parts.push({type: 'table', table});
        else currentText += (currentText ? '\n' : '') + tableLines.join('\n');
    }
    if (currentText.trim()) parts.push({type: 'text', content: currentText.trim()});
    return parts;
}

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
        <div className="w-2 h-2 bg-gray-500 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="w-2 h-2 bg-gray-500 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-gray-500 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
    </div>
);

export const DiscussionModal: React.FC<DiscussionModalProps> = ({ 
    isOpen, onClose, topic, topicId, caseTitle, language, T, initialHistory, onSaveDiscussion 
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [activeImagePrompt, setActiveImagePrompt] = useState<{prompt: string, index: number} | null>(null);
    const chatRef = useRef<Chat | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const shareMenuRef = useRef<HTMLDivElement | null>(null);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (isOpen) {
            const systemInstruction = `You are an expert medical tutor. Facilitate a deep Socratic discussion about "${topic.aspect}" for "${caseTitle}". 
            
            **STRICT FORMATTING RULES:**
            1. **NO BACKSLASHES:** Never use \\. 
            2. **NO LATEX DELIMITERS:** Never use '$' for variables. Use Unicode symbols (e.g., PaO₂, SaO₂).
            3. **HIGH FIDELITY CONTENT:** Use clear formatting, separation of words, and provide specific citations. Use Markdown Tables for data comparisons.
            4. **VISUALS:** Use [GRAPH: type] for complex physiology explanation.
            
            Language: ${language}.`;
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            let chatHistory: Content[] | undefined = undefined;
            if (initialHistory && initialHistory.length > 0) {
                setMessages(initialHistory);
                chatHistory = initialHistory.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'model', parts: [{ text: m.text }] }));
                setIsSaved(true);
            } else {
                setMessages([{ role: 'system', text: T.chatWelcomeMessage }]);
                setIsSaved(false);
            }
            chatRef.current = ai.chats.create({
              model: 'gemini-3-pro-preview',
              config: { systemInstruction, thinkingConfig: { thinkingBudget: 32768 } },
              history: chatHistory
            });
        } else {
            chatRef.current = null;
        }
    }, [isOpen, topic, caseTitle, language, T, initialHistory]);

    const handleMicClick = () => {
        if (!isSpeechRecognitionSupported) return;
        if (isListening) { recognitionRef.current?.stop(); return; }
        const recognition = new SpeechRecognition();
        recognition.lang = getBCP47Language(language);
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (e: any) => setUserInput(e.results[0][0].transcript);
        recognitionRef.current = recognition;
        recognition.start();
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSendMessage = async (e?: React.FormEvent, customMsg?: string) => {
        if (e) e.preventDefault();
        const text = customMsg || userInput;
        if (!text.trim() || isLoading || !chatRef.current) return;
        const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setUserInput('');
        setIsLoading(true);
        setIsSaved(false); 
        try {
            const result = await retryWithBackoff(() => chatRef.current!.sendMessageStream({ message: text })) as AsyncIterable<GenerateContentResponse>;
            let currentResponse = '';
            setMessages(prev => [...prev, { role: 'model', text: '', timestamp: Date.now() }]);
            for await (const chunk of result) {
                currentResponse += chunk.text || '';
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], text: currentResponse };
                    return newMessages;
                });
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'system', text: T.errorChat }]);
        } finally { setIsLoading(false); }
    };

    const handleImageGenerated = (index: number, imageData: string) => {
        setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages[index]) newMessages[index] = { ...newMessages[index], imageData };
            return newMessages;
        });
        setIsSaved(false);
        setActiveImagePrompt(null);
    };

    const handleDownloadPdf = async () => {
        const { jsPDF } = (window as any).jspdf;
        const doc = new jsPDF();
        const margin = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const brandColor = '#1e3a8a';
        
        doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(brandColor).text('Ungana Medical', margin, 20);
        doc.setDrawColor(brandColor).setLineWidth(0.5).line(margin, 23, pageWidth - margin, 23);
        doc.setFontSize(14).setTextColor('#111827').text(`Clinical Tutorial: ${topic.aspect.toUpperCase()}`, margin, 35);
        doc.setFontSize(10).setTextColor('#4b5563').text(`Case: ${caseTitle}`, margin, 42);
        
        let y = 52;

        for (const [mIdx, m] of messages.filter(msg => msg.role !== 'system').entries()) {
            const isUser = m.role === 'user';
            
            // Handle Message Header
            if (y > 270) { doc.addPage(); y = 20; }
            doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(isUser ? brandColor : '#6b7280');
            doc.text(`${isUser ? 'STUDENT QUESTION' : 'AI TUTOR RESPONSE'}`, margin, y);
            y += 7;

            // Handle Text and Tables
            const blocks = splitMessageContent(m.text);
            for (const block of blocks) {
                if (block.type === 'text') {
                    doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor('#111827');
                    const cleaned = cleanTextForDownload(block.content || '');
                    const lines = doc.splitTextToSize(cleaned, pageWidth - 2 * margin);
                    if (y + (lines.length * 6) > 275) { doc.addPage(); y = 20; }
                    doc.text(lines, margin, y);
                    y += (lines.length * 6) + 4;
                } else if (block.type === 'table' && block.table) {
                    if (y > 240) { doc.addPage(); y = 20; }
                    (doc as any).autoTable({
                        startY: y,
                        head: [block.table.header],
                        body: block.table.data,
                        margin: { left: margin },
                        styles: { fontSize: 9, font: 'helvetica' },
                        headStyles: { fillColor: brandColor, textColor: 255 },
                        theme: 'grid'
                    });
                    y = (doc as any).lastAutoTable.finalY + 10;
                }
            }

            // High Fidelity: Handle Scientific Graphs
            const graphMatches = [...m.text.matchAll(/\[GRAPH: (.*?)\]/g)];
            if (graphMatches.length > 0 && scrollContainerRef.current) {
                const graphElements = scrollContainerRef.current.querySelectorAll('svg');
                // Note: We match the graphs in order of appearance in the text
                for (let gIdx = 0; gIdx < graphMatches.length; gIdx++) {
                    const svg = graphElements[gIdx] as SVGSVGElement;
                    if (svg) {
                        const imgData = await captureSvgAsBase64(svg);
                        if (y > 180) { doc.addPage(); y = 20; }
                        const imgW = pageWidth - (margin * 2);
                        const imgH = (imgW * svg.clientHeight) / svg.clientWidth;
                        doc.addImage(imgData, 'PNG', margin, y, imgW, imgH);
                        y += imgH + 10;
                    }
                }
            }

            // Handle Generated Illustrations
            if (m.imageData) {
                if (y > 200) { doc.addPage(); y = 20; }
                const imgData = `data:image/png;base64,${m.imageData}`;
                const imgW = 140; // Maintain standard width
                const imgH = 105;
                doc.addImage(imgData, 'PNG', (pageWidth - imgW) / 2, y, imgW, imgH);
                y += imgH + 10;
            }

            y += 5; // Spacing between messages
        }
        
        doc.save(`Tutorial_${topic.aspect.replace(/\s+/g, '_')}.pdf`);
        setShowShareMenu(false);
    };

    if (!isOpen) return null;

    return (
        <div className={`fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in ${isFullscreen ? 'bg-white dark:bg-dark-bg' : ''}`} aria-modal="true" role="dialog">
            <div className={`bg-white dark:bg-dark-surface flex flex-col transition-all duration-300 ${isFullscreen ? 'w-full h-full rounded-none' : 'rounded-xl shadow-2xl w-full max-w-lg h-[90vh] sm:h-[85vh]'}`}>
                <header className={`p-4 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface z-10 transition-colors ${isFullscreen ? 'rounded-none' : 'rounded-t-xl'}`}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 truncate pr-4">{T.discussionTitle}</h2>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="relative" ref={shareMenuRef}>
                                <button onClick={() => setShowShareMenu(!showShareMenu)} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-brand-blue rounded-full transition" title="Export Options">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                </button>
                                {showShareMenu && (
                                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-surface rounded-md shadow-lg border border-gray-200 dark:border-dark-border z-20 py-1 animate-fade-in">
                                        <button onClick={handleDownloadPdf} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2">
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                            High Fidelity PDF Report
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-brand-blue rounded-full transition">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5" /></svg>
                            </button>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                        </div>
                    </div>
                </header>
                <main ref={scrollContainerRef} className={`p-4 overflow-y-auto flex-grow bg-gray-50/50 dark:bg-slate-900/50 transition-colors ${isFullscreen ? 'max-w-4xl mx-auto w-full' : ''}`}>
                    <div className="space-y-6">
                        {messages.map((msg, index) => {
                            const illustrationMatch = msg.text.match(/\[ILLUSTRATE: (.*?)\]/);
                            const graphMatches = [...msg.text.matchAll(/\[GRAPH: (.*?)\]/g)];
                            const textWithoutTags = msg.text.replace(/\[ILLUSTRATE:.*?\]/g, '').replace(/\[DIAGRAM:.*?\]/g, '').replace(/\[GRAPH:.*?\]/g, '').trim();
                            return (
                                <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {msg.role === 'model' && <div className="w-8 h-8 bg-brand-blue dark:bg-brand-blue-light text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm">AI</div>}
                                    <div className={`max-w-[85%] space-y-3 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`px-4 py-3 rounded-2xl text-sm shadow-sm transition-colors ${msg.role === 'user' ? 'bg-brand-blue dark:bg-brand-blue-light text-white rounded-tr-none' : msg.role === 'model' ? 'bg-white dark:bg-dark-surface text-brand-text dark:text-slate-200 border border-gray-200 dark:border-dark-border rounded-tl-none' : 'text-center w-full text-gray-500 italic bg-transparent shadow-none'}`}>
                                            {msg.role === 'model' ? (
                                                <div className="space-y-2">
                                                    <MarkdownRenderer content={textWithoutTags} />
                                                    <div className="pt-2 mt-2 border-t border-gray-50 dark:border-dark-border">
                                                        <SourceRenderer text={msg.text} />
                                                    </div>
                                                </div>
                                            ) : <p className="whitespace-pre-wrap">{msg.text}</p>}
                                            {illustrationMatch && !msg.imageData && (
                                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dark-border flex justify-center">
                                                    <button onClick={() => setActiveImagePrompt({ prompt: illustrationMatch[1], index })} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition text-xs font-semibold">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                                        Generate Illustration
                                                    </button>
                                                </div>
                                            )}
                                            {graphMatches.length > 0 && (
                                                <div className="space-y-4 mt-4 pt-4 border-t border-gray-100 dark:border-dark-border">
                                                    {graphMatches.map((m, i) => (
                                                        <ScientificGraph 
                                                            key={i} 
                                                            type={m[1].trim() as any} 
                                                            title={GRAPH_TITLES[m[1].trim()] || "Physiological Relationship Model"} 
                                                            className="scale-100" 
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                            {msg.imageData && <div className="mt-3"><img src={`data:image/png;base64,${msg.imageData}`} alt="Illustration" className="rounded-lg border border-gray-100 dark:border-dark-border shadow-sm max-w-full h-auto" /></div>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {isLoading && (
                            <div className="flex items-start gap-3 flex-row">
                                <div className="w-8 h-8 bg-brand-blue dark:bg-brand-blue-light text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-sm">AI</div>
                                <div className="px-5 py-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl rounded-tl-none shadow-sm transition-colors"><LoadingSpinner /></div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </main>
                <footer className={`p-4 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface transition-colors ${isFullscreen ? 'rounded-none' : 'rounded-b-xl'}`}>
                    <div className={`flex flex-col ${isFullscreen ? 'max-w-4xl mx-auto w-full' : ''}`}>
                        <form onSubmit={(e) => handleSendMessage(e)} className="flex items-center gap-2 mb-3">
                            <button type="button" onClick={handleMicClick} disabled={isLoading} className={`p-2 rounded-md border transition ${isListening ? 'text-red-500 border-red-500 bg-red-50' : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-dark-border hover:bg-gray-100'}`}>
                                <AudioVisualizer isListening={isListening} />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm-1 4a4 4 0 108 0V4a4 4 0 10-8 0v4zM2 11a1 1 0 011-1h1a1 1 0 011 1v.5a.5.5 0 001 0V11a3 3 0 013-3h0a3 3 0 013 3v.5a.5.5 0 001 0V11a1 1 0 011 1h1a1 1 0 110 2h-1a1 1 0 01-1-1v-.5a2.5 2.5 0 00-5 0v.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" clipRule="evenodd" /></svg>
                            </button>
                            <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder={T.chatPlaceholder} disabled={isLoading} className="flex-grow p-2 border border-gray-300 dark:border-dark-border rounded-md bg-gray-50 dark:bg-slate-800 text-black dark:text-white text-sm focus:ring-2 focus:ring-brand-blue/20 transition-colors" />
                            <button type="submit" disabled={isLoading || !userInput.trim()} className="bg-brand-blue hover:bg-blue-800 text-white font-bold p-2 rounded-md transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.428A1 1 0 0010 16h.008a1 1 0 00.724-.316l5-5a1 1 0 00.316-.724V4a1 1 0 00-1-1h-2a1 1 0 00-1 1v.008a1 1 0 00.316.724l-3 3.428z" /></svg></button>
                        </form>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-dark-border">
                            <span className="text-[10px] text-gray-400 italic">{isSaved ? "Saved to case history" : "Unsaved session"}</span>
                            <button type="button" onClick={() => { onSaveDiscussion(topicId, messages); setIsSaved(true); }} disabled={isLoading} className={`text-xs px-4 py-1.5 rounded-md font-semibold border transition ${isSaved ? 'text-green-700 bg-green-50 border-green-200' : 'text-brand-blue bg-blue-50 border-blue-200 hover:bg-blue-100'}`}>
                                {isSaved ? "Saved" : "Save Session"}
                            </button>
                        </div>
                    </div>
                </footer>
            </div>
            {activeImagePrompt && <ImageGenerator content={{ title: 'Clinical Illustration', description: activeImagePrompt.prompt, type: EducationalContentType.IMAGE, reference: 'AI Generated' }} onClose={() => setActiveImagePrompt(null)} language={language} T={T} onImageGenerated={(data) => handleImageGenerated(activeImagePrompt.index, data)} />}
        </div>
    );
};
