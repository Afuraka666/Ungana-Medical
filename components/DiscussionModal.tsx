import React, { useState, useEffect, useRef } from 'react';
import type { DisciplineSpecificConsideration, ChatMessage, DiagramData } from '../types';
import { GoogleGenAI, Chat, GenerateContentResponse, Content } from "@google/genai";
import { retryWithBackoff, generateDiagramForDiscussion } from '../services/geminiService';
import { InteractiveDiagram } from './InteractiveDiagram';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, ImageRun } from 'docx';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

// Helper to map app language to BCP-47 for speech recognition
const getBCP47Language = (lang: string): string => {
    const map: Record<string, string> = {
        'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'zh': 'zh-CN', 'hi': 'hi-IN',
        'sw': 'sw-KE', 'ar': 'ar-SA', 'pt': 'pt-PT', 'ru': 'ru-RU', 'el': 'el-GR',
    };
    return map[lang] || 'en-US';
};

// Helper: Cleans LaTeX and Markdown symbols for text-based downloads
const cleanTextForDownload = (text: string): string => {
    return text
        // Convert common medical LaTeX to Unicode
        .replace(/\$t_{1\/2}\$/g, 'T½')
        .replace(/\$t_\{1\/2\}\$/g, 'T½')
        .replace(/\$CO_2\$/g, 'CO₂')
        .replace(/\$O_2\$/g, 'O₂')
        .replace(/\$H_2O\$/g, 'H₂O')
        .replace(/\$SpO_2\$/g, 'SpO₂')
        .replace(/\$Na\^+\$/g, 'Na⁺')
        .replace(/\$K\^+\$/g, 'K⁺')
        .replace(/\$Cl^-\$/g, 'Cl⁻')
        .replace(/\$HCO_3^-\$/g, 'HCO₃⁻')
        // Strip other LaTeX markers
        .replace(/\$/g, '')
        // Strip Markdown bold/italic
        .replace(/\*\*\*/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/_/g, '')
        // Strip Markdown headers
        .replace(/#+\s/g, '')
        // Strip Markdown links but keep title
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .trim();
};

// Helper: Converts SVG element to DataURL PNG
const svgToDataURL = async (svgEl: SVGSVGElement): Promise<string> => {
    const g = svgEl.querySelector('g');
    if (!g) return '';
    const bbox = g.getBBox();
    if (bbox.width === 0 || bbox.height === 0) return '';

    const padding = 40;
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;

    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', width.toString());
    svgClone.setAttribute('height', height.toString());
    svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);
    
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', width.toString());
    bgRect.setAttribute('height', height.toString());
    bgRect.setAttribute('fill', 'white');
    bgRect.setAttribute('x', `${bbox.x - padding}`);
    bgRect.setAttribute('y', `${bbox.y - padding}`);
    svgClone.prepend(bgRect);

    const xml = new XMLSerializer().serializeToString(svgClone);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const image64 = `data:image/svg+xml;base64,${svg64}`;

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 2;
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png', 1.0));
            } else resolve('');
        };
        img.onerror = () => resolve('');
        img.src = image64;
    });
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
            const systemInstruction = `You are an expert medical tutor. Facilitate a Socratic discussion about "${topic.aspect}" in the context of "${caseTitle}". 
            
            **Guidelines:**
            - Use Unicode for formulas (CO₂, T½, Na⁺) instead of LaTeX where possible for better readability.
            - If you suggest regional blocks, specify: Name, Dose per kg/volume (include 0.5% Bupivacaine alternative if Ropivacaine mentioned), and Coverage (somatosensory/visceral).
            - Synthesize traceable evidence labels [Synthesis].
            - Format text in Markdown. Respond in ${language}.`;
            
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
            if (recognitionRef.current) recognitionRef.current.abort();
        }
    }, [isOpen, topic, caseTitle, language, T, initialHistory]);

    const handleMicClick = () => {
        if (!isSpeechRecognitionSupported) return;
        if (isListening) { recognitionRef.current?.stop(); return; }
        setMicError(null);
        const recognition = new SpeechRecognition();
        recognition.lang = getBCP47Language(language);
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => { setMicError(T.micGenericError); setIsListening(false); };
        recognition.onresult = (e: any) => setUserInput(prev => `${prev} ${e.results[0][0].transcript}`.trim());
        recognitionRef.current = recognition;
        recognition.start();
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || !chatRef.current) return;
        const userMsg: ChatMessage = { role: 'user', text: userInput, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setUserInput('');
        setIsLoading(true);
        setIsSaved(false); 
        try {
            // FIX: Added explicit cast to AsyncIterable to fix the 'unknown' iterator error.
            const result = await retryWithBackoff(() => chatRef.current!.sendMessageStream({ message: userInput })) as AsyncIterable<GenerateContentResponse>;
            let currentResponse = '';
            setMessages(prev => [...prev, { role: 'model', text: '', timestamp: Date.now() }]);
            for await (const chunk of result) {
                // FIX: Chunk text access is now safer using the .text property from the GenerateContentResponse.
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

    const handleGenerateDiagram = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!diagramPrompt.trim() || isLoading) return;
        setIsLoading(true);
        setIsGeneratingDiagram(false);
        const chatContext = messages.map(m => `${m.role}: ${m.text}`).join('\n');
        try {
            const diagramData = await generateDiagramForDiscussion(diagramPrompt, chatContext, language);
            setMessages(prev => [...prev, { role: 'model', text: `Diagram: ${diagramPrompt}`, diagramData, timestamp: Date.now() }]);
            setDiagramPrompt('');
            setIsSaved(false);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'system', text: "Diagram generation failed." }]);
        } finally { setIsLoading(false); }
    };

    const handleDownloadPdf = async () => {
        const { jsPDF } = (window as any).jspdf;
        const doc = new jsPDF();
        const margin = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const brandColor = '#1e3a8a';
        
        doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(brandColor).text('Ungana Medical', margin, 20);
        doc.setDrawColor(brandColor).setLineWidth(0.5).line(margin, 23, pageWidth - margin, 23);
        doc.setFontSize(12).text(`TUTORIAL REPORT: ${topic.aspect.toUpperCase()}`, margin, 33);
        doc.setFont('helvetica', 'italic').setFontSize(10).setTextColor('#4b5563');
        const ctxLines = doc.splitTextToSize(`Context: ${topic.consideration}`, pageWidth - 2 * margin);
        doc.text(ctxLines, margin, 40);
        
        let y = 40 + (ctxLines.length * 5) + 12;

        for (const [idx, m] of messages.filter(msg => msg.role !== 'system').entries()) {
            const isUser = m.role === 'user';
            doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(isUser ? brandColor : '#374151').text(`[${isUser ? 'STUDENT' : 'AI TUTOR'}]`, margin, y);
            y += 6;
            doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor('#111827');
            const cleaned = cleanTextForDownload(m.text);
            const lines = doc.splitTextToSize(cleaned, pageWidth - 2 * margin);
            if (y + (lines.length * 5) > 275) { doc.addPage(); y = 20; }
            doc.text(lines, margin, y);
            y += (lines.length * 5) + 8;

            if (m.diagramData) {
                const svgId = `diagram-chat-${idx}`;
                const svgEl = document.querySelector(`#${svgId} svg`) as SVGSVGElement;
                if (svgEl) {
                    const dataUrl = await svgToDataURL(svgEl);
                    if (dataUrl) {
                        const imgW = 120; const imgH = 90;
                        if (y + imgH > 270) { doc.addPage(); y = 20; }
                        doc.addImage(dataUrl, 'PNG', (pageWidth - imgW) / 2, y, imgW, imgH);
                        y += imgH + 10;
                    }
                }
            }
        }
        doc.save(`Ungana_Discussion_${topic.aspect.replace(/\s+/g, '_')}.pdf`);
        setShowShareMenu(false);
    };

    const handleDownloadWord = async () => {
        const brandColor = '1e3a8a';
        const sections: any[] = [
            new Paragraph({ children: [new TextRun({ text: 'Ungana Medical', bold: true, color: brandColor, size: 36 })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
            new Paragraph({ children: [new TextRun({ text: `Tutorial: ${topic.aspect}`, bold: true, size: 28 })], heading: HeadingLevel.HEADING_1, border: { bottom: { color: brandColor, space: 1, style: BorderStyle.SINGLE, size: 6 } }, spacing: { after: 200 } }),
            new Paragraph({ children: [new TextRun({ text: `Context: ${topic.consideration}`, italic: true, size: 20, color: '4b5563' })], spacing: { after: 400 } })
        ];

        for (const [idx, m] of messages.filter(msg => msg.role !== 'system').entries()) {
            const isUser = m.role === 'user';
            sections.push(new Paragraph({ children: [new TextRun({ text: `[${isUser ? 'STUDENT' : 'AI TUTOR'}]`, bold: true, color: isUser ? brandColor : '374151', size: 20 })], spacing: { before: 200 } }));
            sections.push(new Paragraph({ children: [new TextRun({ text: cleanTextForDownload(m.text), size: 22 })], spacing: { after: 100 } }));
            
            if (m.diagramData) {
                const svgId = `diagram-chat-${idx}`;
                const svgEl = document.querySelector(`#${svgId} svg`) as SVGSVGElement;
                if (svgEl) {
                    const dataUrl = await svgToDataURL(svgEl);
                    if (dataUrl) {
                        const base64 = dataUrl.split(',')[1];
                        sections.push(new Paragraph({ children: [new ImageRun({ data: Uint8Array.from(atob(base64), c => c.charCodeAt(0)), transformation: { width: 450, height: 330 } })], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } }));
                    }
                }
            }
        }
        const doc = new Document({ sections: [{ children: sections }] });
        const blob = await Packer.toBlob(doc);
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Ungana_Discussion_${topic.aspect.replace(/\s+/g, '_')}.docx`; a.click();
        setShowShareMenu(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[90vh] sm:h-[85vh] flex flex-col">
                <header className="p-4 border-b border-gray-200 bg-white rounded-t-xl z-10">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-bold text-gray-800 truncate pr-4">{T.discussionTitle}</h2>
                        <div className="flex items-center gap-2">
                            <div className="relative" ref={shareMenuRef}>
                                <button onClick={() => setShowShareMenu(!showShareMenu)} className="p-1.5 text-gray-500 hover:text-brand-blue hover:bg-gray-100 rounded-full transition" title={T.shareDiscussion}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                </button>
                                {showShareMenu && (
                                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 z-20 animate-fade-in py-1">
                                        <button onClick={() => { navigator.clipboard.writeText(messages.map(m => `[${m.role.toUpperCase()}]: ${m.text}`).join('\n\n')); setShowShareMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>{T.copyTranscript}</button>
                                        <button onClick={handleDownloadPdf} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"><svg className="h-4 w-4 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1h-17c-.552 0-1-.448-1-1v-19c0-.552.448-1 1-1h10.363zm4.137 17l-1.5-5h-1l-1.5 5h1.1l.3-1h1.2l.3 1h1.1zm-4.5-5h-2.5v5h1.1v-1.6h1.4c.828 0 1.5-.672 1.5-1.5s-.672-1.9-1.5-1.9zm-4 0h-2.5v5h2.5c.828 0 1.5-.672 1.5-1.5v-2c0-.828-.672-1.5-1.5-1.5zm6.5 1.4c0 .221-.179.4-.4.4h-1.4v-.8h1.4c.221 0 .4.179.4.4zm-4 1.1h-1.4v-1.1h1.4c.221 0 .4.179.4.4v.3c0 .221-.179.4-.4.4zm3.1-.7l-.4 1.3h-.8l-.4-1.3.1-.3h1.4l.1.3z" /></svg>{T.downloadPdfButton}</button>
                                        <button onClick={handleDownloadWord} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"><svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-3 8h6v1h-6v-1zm0 2h6v1h-6v-1zm0 2h6v1h-6v-1zm0 2h6v1h-6v-1zm0 2h6v1h-6v-1z" /></svg>{T.downloadWordButton}</button>
                                    </div>
                                )}
                            </div>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                        </div>
                    </div>
                </header>
                <main className="p-4 overflow-y-auto flex-grow bg-gray-50/50">
                    <div className="space-y-4">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'model' && <div className="w-6 h-6 bg-brand-blue text-white rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold">AI</div>}
                                <div className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-brand-blue text-white rounded-br-none' : msg.role === 'model' ? 'bg-gray-200 text-brand-text rounded-bl-none' : 'text-center w-full text-gray-500 italic'}`}>
                                    {msg.role === 'model' ? <MarkdownRenderer content={msg.text} /> : <p className="whitespace-pre-wrap">{msg.text}</p>}
                                    {msg.diagramData && <div id={`diagram-chat-${index}`} className="mt-2 h-64 w-full rounded-lg border border-gray-300 bg-white"><InteractiveDiagram data={msg.diagramData} /></div>}
                                </div>
                            </div>
                        ))}
                        {isLoading && <div className="flex items-end gap-2 justify-start"><div className="w-6 h-6 bg-brand-blue text-white rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold">AI</div><div className="px-4 py-3 bg-gray-200 rounded-2xl rounded-bl-none"><LoadingSpinner /></div></div>}
                        <div ref={messagesEndRef} />
                    </div>
                </main>
                <footer className="p-4 border-t border-gray-200 bg-white rounded-b-xl z-10">
                    {micError && <div className="mb-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">{micError}</div>}
                    {isGeneratingDiagram && (
                        <form onSubmit={handleGenerateDiagram} className="p-2 border border-gray-200 rounded-lg mb-2 bg-gray-50 flex items-center gap-2">
                            <input type="text" value={diagramPrompt} onChange={(e) => setDiagramPrompt(e.target.value)} placeholder={T.diagramPlaceholder} className="flex-grow p-1.5 border border-gray-300 rounded-md text-sm text-black" autoFocus />
                            <button type="submit" disabled={isLoading || !diagramPrompt.trim()} className="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded-md transition text-sm">Generate</button>
                            <button type="button" onClick={() => setIsGeneratingDiagram(false)} className="text-gray-500 text-sm">{T.cancelButton}</button>
                        </form>
                    )}
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 mb-3">
                        <button type="button" onClick={() => setIsGeneratingDiagram(prev => !prev)} disabled={isLoading} className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg></button>
                        <button type="button" onClick={handleMicClick} disabled={isLoading} className={`p-2 rounded-md border transition ${isListening ? 'text-red-500 border-red-500 bg-red-50' : 'text-gray-600 border-gray-300'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm-1 4a4 4 0 108 0V4a4 4 0 10-8 0v4zM2 11a1 1 0 011-1h1a1 1 0 011 1v.5a.5.5 0 001 0V11a3 3 0 013-3h0a3 3 0 013 3v.5a.5.5 0 001 0V11a1 1 0 011 1h1a1 1 0 110 2h-1a1 1 0 01-1-1v-.5a2.5 2.5 0 00-5 0v.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" clipRule="evenodd" /></svg></button>
                        <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder={T.chatPlaceholder} disabled={isLoading} className="flex-grow p-2 border border-gray-300 rounded-md bg-gray-50 text-black text-sm" />
                        <button type="submit" disabled={isLoading || !userInput.trim()} className="bg-brand-blue hover:bg-blue-800 text-white font-bold p-2 rounded-md disabled:bg-gray-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.428A1 1 0 0010 16h.008a1 1 0 00.724-.316l5-5a1 1 0 00.316-.724V4a1 1 0 00-1-1h-2a1 1 0 00-1 1v.008a1 1 0 00.316.724l-3 3.428z" /></svg></button>
                    </form>
                    <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                        <span className="text-[10px] text-gray-400 italic">{isSaved ? "Saved to case." : "Unsaved changes."}</span>
                        <button type="button" onClick={() => { onSaveDiscussion(topicId, messages); setIsSaved(true); }} disabled={isLoading} className={`text-xs px-4 py-1.5 rounded-md transition font-medium border flex items-center gap-1 shadow-sm ${isSaved ? 'text-green-700 bg-green-50 border-green-200' : 'text-brand-blue bg-blue-50 hover:bg-blue-100 border-blue-200'}`}>
                            {isSaved ? <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>Saved</> : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>Save Discussion</>}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};
