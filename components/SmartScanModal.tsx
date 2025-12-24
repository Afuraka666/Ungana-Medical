
import React, { useState, useRef } from 'react';
import { analyzeMedicalDocument } from '../services/geminiService';

interface SmartScanModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDataExtracted: (text: string) => void;
    language: string;
    T: Record<string, any>;
}

export const SmartScanModal: React.FC<SmartScanModalProps> = ({ isOpen, onClose, onDataExtracted, language, T }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please select an image file.');
            return;
        }

        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setError(null);
        
        processImage(file);
    };

    const processImage = async (file: File) => {
        setIsProcessing(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const analysis = await analyzeMedicalDocument(base64, file.type, language);
                onDataExtracted(analysis);
                handleClose();
            };
            reader.readAsDataURL(file);
        } catch (err: any) {
            console.error(err);
            setError('Failed to analyze document. Please try again.');
            setIsProcessing(false);
        }
    };

    const handleClose = () => {
        setPreviewUrl(null);
        setError(null);
        setIsProcessing(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100] p-4 animate-fade-in" role="dialog">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                <header className="p-4 border-b border-gray-200 flex justify-between items-center bg-brand-blue text-white">
                    <h2 className="text-lg font-bold">Smart Scan</h2>
                    <button onClick={handleClose} className="p-1 hover:bg-white/20 rounded-full transition">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </header>

                <main className="p-6 flex flex-col items-center justify-center space-y-4 min-h-[300px]">
                    {!previewUrl && !isProcessing ? (
                        <div className="text-center space-y-6">
                            <div className="w-20 h-20 bg-blue-50 text-brand-blue rounded-full flex items-center justify-center mx-auto shadow-inner">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Scan Medical Document</h3>
                                <p className="text-sm text-gray-500 mt-2">Take a photo of blood tests, imaging reports, or clinical notes. Our AI will extract and structure the data for you.</p>
                            </div>
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full bg-brand-blue hover:bg-blue-800 text-white font-bold py-4 px-6 rounded-xl transition shadow-lg flex items-center justify-center space-x-2 text-lg"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
                                <span>Open Camera</span>
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                capture="environment" 
                                onChange={handleFileSelect} 
                            />
                        </div>
                    ) : isProcessing ? (
                        <div className="text-center space-y-4">
                            <div className="relative w-48 h-48 mx-auto">
                                {previewUrl && <img src={previewUrl} className="w-full h-full object-cover rounded-lg opacity-50" alt="Preview" />}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <svg className="animate-spin h-12 w-12 text-brand-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                </div>
                                <div className="absolute inset-0 border-2 border-brand-blue rounded-lg animate-pulse"></div>
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 text-lg">AI Parsing in Progress...</p>
                                <p className="text-sm text-gray-500">Extracting values and clinical details</p>
                            </div>
                        </div>
                    ) : null}

                    {error && (
                        <div className="w-full p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start space-x-2">
                            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
                            <span>{error}</span>
                        </div>
                    )}
                </main>

                <footer className="p-4 bg-gray-50 border-t border-gray-200 flex justify-center">
                     <button onClick={handleClose} className="text-gray-600 font-bold py-2 px-6">Cancel</button>
                </footer>
            </div>
        </div>
    );
};
