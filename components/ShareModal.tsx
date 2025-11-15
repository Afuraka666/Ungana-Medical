
import React, { useState, useEffect, useCallback } from 'react';
import type { PatientCase } from '../types';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    patientCase: PatientCase | null;
    T: Record<string, any>;
}

// Helper: Compresses a JSON object into a URL-safe Base64 string
async function compressAndEncode(object: object): Promise<string> {
    try {
        const jsonString = JSON.stringify(object);
        const stream = new Blob([jsonString], { type: 'application/json' }).stream();
        const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
        const reader = compressedStream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const buffer = await new Blob(chunks).arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        // Make it URL-safe
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } catch (error) {
        console.error("Compression failed:", error);
        return '';
    }
}

// Helper: Formats the case data into a readable text string for download
const formatCaseForTextFile = (patientCase: PatientCase, T: Record<string, any>): string => {
    let text = `Title: ${patientCase.title}\r\n\r\n`;
    text += `## ${T.patientProfile}\r\n${patientCase.patientProfile}\r\n\r\n`;
    text += `## ${T.presentingComplaint}\r\n${patientCase.presentingComplaint}\r\n\r\n`;
    text += `## ${T.history}\r\n${patientCase.history}\r\n\r\n`;

    if (patientCase.biochemicalPathway) {
        text += `## ${T.biochemicalPathwaySection}\r\n`;
        text += `### ${patientCase.biochemicalPathway.title} (${patientCase.biochemicalPathway.type})\r\n`;
        text += `${patientCase.biochemicalPathway.description}\r\n`;
        text += `Reference: ${patientCase.biochemicalPathway.reference}\r\n\r\n`;
    }

    text += `## ${T.multidisciplinaryConnections}\r\n`;
    patientCase.multidisciplinaryConnections.forEach(conn => {
        text += `- ${conn.discipline}: ${conn.connection}\r\n`;
    });
    return text;
};

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, patientCase, T }) => {
    const [shareLink, setShareLink] = useState('');
    const [isGeneratingLink, setIsGeneratingLink] = useState(true);
    const [isCopied, setIsCopied] = useState(false);
    const isWebShareSupported = !!navigator.share;

    useEffect(() => {
        if (isOpen && patientCase) {
            setIsGeneratingLink(true);
            compressAndEncode(patientCase).then(encodedData => {
                const url = new URL(window.location.origin + window.location.pathname);
                url.searchParams.set('case', encodedData);
                setShareLink(url.toString());
                setIsGeneratingLink(false);
            });
        }
    }, [isOpen, patientCase]);

    const handleCopyLink = useCallback(() => {
        if (!shareLink) return;
        navigator.clipboard.writeText(shareLink).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    }, [shareLink]);

    const handleNativeShare = useCallback(() => {
        if (isWebShareSupported && shareLink && patientCase) {
            navigator.share({
                title: `Synapsis Medical Case: ${patientCase.title}`,
                text: `Check out this medical case I generated with Synapsis Medical.`,
                url: shareLink,
            }).catch(error => console.error("Web Share API error:", error));
        }
    }, [isWebShareSupported, shareLink, patientCase]);
    
    const handleDownload = (format: 'json' | 'text') => {
        if (!patientCase) return;
        const filename = `${patientCase.title.replace(/ /g, '_')}.${format}`;
        let content = '';
        let mimeType = '';

        if (format === 'json') {
            content = JSON.stringify(patientCase, null, 2);
            mimeType = 'application/json';
        } else {
            content = formatCaseForTextFile(patientCase, T);
            mimeType = 'text/plain';
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[95vh] sm:max-h-[80vh] flex flex-col">
                <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">{T.shareModalTitle}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </header>

                <main className="p-6 overflow-y-auto flex-grow space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.shareLinkDescription}</label>
                        <div className="mt-1 flex rounded-md shadow-sm">
                            <input
                                type="text"
                                readOnly
                                value={isGeneratingLink ? 'Generating link...' : shareLink}
                                className="flex-1 block w-full rounded-none rounded-l-md p-2 border border-gray-300 bg-gray-50 text-gray-600 text-sm"
                            />
                            <button
                                onClick={handleCopyLink}
                                disabled={isGeneratingLink || isCopied}
                                className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:bg-gray-200"
                            >
                               {isCopied ? T.linkCopied : T.copyLinkButton}
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {isWebShareSupported && (
                             <button onClick={handleNativeShare} disabled={isGeneratingLink} className="w-full flex items-center justify-center space-x-2 bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-md transition disabled:bg-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>
                                <span>{T.shareNativeButton}</span>
                            </button>
                        )}
                        <button onClick={() => handleDownload('json')} className="w-full flex items-center justify-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            <span>{T.downloadJSONButton}</span>
                        </button>
                        <button onClick={() => handleDownload('text')} className="w-full flex items-center justify-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            <span>{T.downloadTextButton}</span>
                        </button>
                    </div>
                </main>

                <footer className="p-3 border-t border-gray-200 text-right bg-gray-50">
                    <button 
                        onClick={onClose} 
                        className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-md transition duration-300"
                    >
                        {T.closeButton}
                    </button>
                </footer>
            </div>
        </div>
    );
};
