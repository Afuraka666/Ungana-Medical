
import React, { useState, useEffect } from 'react';
import type { EducationalContent } from '../types';
import { generateVisualAid } from '../services/geminiService';
import { supportedLanguages } from '../i18n';

interface ImageGeneratorProps {
    content: EducationalContent;
    onClose: () => void;
    language: string;
    T: Record<string, any>;
    onImageGenerated: (imageBase64: string) => void;
}

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin h-10 w-10 text-brand-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export const ImageGenerator: React.FC<ImageGeneratorProps> = ({ content, onClose, language, T, onImageGenerated }) => {
    const [imageData, setImageData] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const generate = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const languageName = supportedLanguages[language as keyof typeof supportedLanguages] || language;
                const prompt = `
Create a professional, clean, and high-contrast medical illustration diagram for an educational app. The style should be modern and minimalist, prioritizing clarity and readability, similar to a high-quality textbook illustration.

Topic to illustrate: "${content.title}"
Key information to include: "${content.description}"

**CRITICAL STYLING REQUIREMENTS (MUST FOLLOW):**
1.  **LIGHT THEME ONLY:** The diagram MUST have a clean white (#FFFFFF) or very light gray (#F8F9FA) background. **Absolutely NO dark backgrounds.**
2.  **HIGH CONTRAST TEXT:** ALL text inside nodes and on labels MUST be black (#000000) or a very dark gray (#212529) to ensure maximum readability.
3.  **PROFESSIONAL COLORS:** Use a professional and harmonious color palette for the nodes/elements (e.g., a combination of muted blues, teals, and grays). Colors must be light enough to contrast sharply with the dark text. Avoid overly saturated or neon colors.
4.  **CLEAR CONNECTIONS (MANDATORY):**
    *   All connections between elements MUST be represented by solid black lines terminating in a clear, visible arrowhead.
    *   The arrowhead must be drawn completely inside the element it points to, with its base on the element's border.
    *   **Every connection line must have an arrowhead.**
    *   Do not write text labels directly on the connection lines.
5.  **CLEAN LAYOUT:** The layout must be logical, spacious, and uncluttered. The final image must look sharp and professional, suitable for a modern medical education platform.

Language for all text and labels: ${languageName}.`;

                const base64Image = await generateVisualAid(prompt);
                setImageData(`data:image/png;base64,${base64Image}`);
                onImageGenerated(base64Image);
            } catch (err: any) {
                console.error(err);
                if (err.message && (err.message.includes("API key not valid") || err.message.includes("Requested entity was not found") || err.message.includes("API_KEY"))) {
                    setError(T.errorService);
                } else {
                    setError(err.message || 'An unknown error occurred while generating the image.');
                }
            } finally {
                setIsLoading(false);
            }
        };
        generate();
    }, [content, language, T, onImageGenerated]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">{content.title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </header>
                <main className="p-6 flex-grow flex items-center justify-center bg-gray-50/50 min-h-[300px]">
                    {isLoading && (
                        <div className="text-center">
                            <LoadingSpinner />
                            <p className="mt-4 text-gray-600">Generating visual aid...</p>
                        </div>
                    )}
                    {error && (
                        <div className="text-center text-red-600">
                            <h3 className="font-semibold">Generation Failed</h3>
                            <p className="text-sm mt-1">{error}</p>
                        </div>
                    )}
                    {imageData && !isLoading && (
                        <img src={imageData} alt={content.title} className="max-w-full max-h-[70vh] object-contain rounded-md" />
                    )}
                </main>
                 <footer className="p-3 border-t border-gray-200 text-right bg-gray-50">
                    <button onClick={onClose} className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-md transition duration-300">
                        {T.closeButton}
                    </button>
                </footer>
            </div>
        </div>
    );
};