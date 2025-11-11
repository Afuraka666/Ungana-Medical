
import React, { useState, useEffect } from 'react';
import type { EducationalContent } from '../types';
import { generateVisualAid } from '../services/geminiService';
import { supportedLanguages } from '../i18n';

interface ImageGeneratorProps {
    content: EducationalContent;
    onClose: () => void;
    language: string;
    T: Record<string, any>;
}

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin h-10 w-10 text-brand-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export const ImageGenerator: React.FC<ImageGeneratorProps> = ({ content, onClose, language, T }) => {
    const [imageData, setImageData] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const generate = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const languageName = supportedLanguages[language as keyof typeof supportedLanguages] || language;
                // Construct a detailed prompt for better results
                const prompt = `Create a clear, accurate medical illustration for a student, in the style of a modern medical textbook diagram. The diagram should have clean lines and be focused on educational clarity.
                
                Title of illustration: "${content.title}"
                
                Detailed description of what to draw: "${content.description}"

                **CRITICAL INSTRUCTION FOR LANGUAGE:**
                All text, including all labels on the diagram, MUST be in **${languageName}**.
                - Language Name: ${languageName}
                - Language Code: ${language}
                - DO NOT use any other language.
                - DO NOT mix languages. Ensure 100% of the text is in ${languageName}.`;

                const base64Image = await generateVisualAid(prompt);
                setImageData(`data:image/png;base64,${base64Image}`);
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
    }, [content, language, T]);

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in"
            aria-modal="true"
            role="dialog"
        >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">AI-Generated Visual Aid</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                
                <div className="p-5 overflow-y-auto flex-grow">
                    <div className="mb-4">
                        <h3 className="font-semibold text-gray-700">{content.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{content.description}</p>
                    </div>

                    <div className="aspect-[4/3] w-full bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                        {isLoading && (
                            <div className="text-center">
                                <LoadingSpinner />
                                <p className="mt-3 text-gray-600 font-medium">Generating visual aid...</p>
                                <p className="text-sm text-gray-500">This may take a moment.</p>
                            </div>
                        )}
                        {error && (
                            <div className="text-center text-red-600 p-4">
                                <h4 className="font-bold">Generation Failed</h4>
                                <p className="text-sm">{error}</p>
                            </div>
                        )}
                        {imageData && (
                            <img src={imageData} alt={content.title} className="w-full h-full object-contain rounded-lg" />
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 text-right">
                    <button 
                        onClick={onClose} 
                        className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-md transition duration-300"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
