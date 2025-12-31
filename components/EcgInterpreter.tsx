
import React, { useState, useCallback } from 'react';
import { interpretEcg } from '../services/geminiService';
// FIX: Imported EcgFindings from types to fix the Module not found error on line 4.
import type { EcgFindings } from '../types';

interface EcgInterpreterProps {
    T: Record<string, any>;
    language: string;
}

export const EcgInterpreter: React.FC<EcgInterpreterProps> = ({ T, language }) => {
    const [findings, setFindings] = useState<EcgFindings>({
        rate: '', rhythm: 'Normal Sinus Rhythm', pr: '', qrs: '', qtc: '', stSegment: 'Normal', other: ''
    });
    const [file, setFile] = useState<{ base64: string; mimeType: string; name: string; url: string } | null>(null);
    const [isInterpreting, setIsInterpreting] = useState(false);
    const [interpretationResult, setInterpretationResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFindings(prev => ({ ...prev, [name]: value }));
    };

    const processFile = (selectedFile: File) => {
        if (!selectedFile.type.startsWith('image/')) {
            setError('Only image files are supported.');
            return;
        }
        if (selectedFile.size > 4 * 1024 * 1024) { // 4MB limit for inline data
            setError('File is too large. Please select an image under 4MB.');
            return;
        }
        setError(null);
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const dataUrl = loadEvent.target?.result as string;
            const base64String = dataUrl.split(',')[1];
            setFile({ base64: base64String, mimeType: selectedFile.type, name: selectedFile.name, url: dataUrl });
        };
        reader.onerror = () => setError('Failed to read the file.');
        reader.readAsDataURL(selectedFile);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) processFile(selectedFile);
    };
    
    const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragOver(true);
        } else if (e.type === 'dragleave') {
            setIsDragOver(false);
        }
    };
    
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) processFile(droppedFile);
    };


    const handleInterpret = async () => {
        setIsInterpreting(true);
        setInterpretationResult(null);
        setError(null);
        try {
            const result = await interpretEcg(findings, file?.base64 || null, file?.mimeType || null, language);
            setInterpretationResult(result);
        } catch (err) {
            console.error("ECG Interpretation failed:", err);
            setError(T.ecgInterpretationError);
        } finally {
            setIsInterpreting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="p-4 bg-slate-100 rounded-lg border border-slate-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.ecgRateLabel}</label>
                        <input type="number" name="rate" value={findings.rate} onChange={handleInputChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.ecgRhythmLabel}</label>
                        <select name="rhythm" value={findings.rhythm} onChange={handleInputChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white">
                            <option>Normal Sinus Rhythm</option><option>Sinus Tachycardia</option><option>Sinus Bradycardia</option><option>Atrial Fibrillation</option><option>Atrial Flutter</option><option>Ventricular Tachycardia</option><option>Other</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">{T.ecgIntervals}</label>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                        <input type="number" name="pr" value={findings.pr} onChange={handleInputChange} placeholder={T.ecgPrInterval} className="p-2 border border-gray-300 rounded-md text-black bg-white text-sm" />
                        <input type="number" name="qrs" value={findings.qrs} onChange={handleInputChange} placeholder={T.ecgQrsDuration} className="p-2 border border-gray-300 rounded-md text-black bg-white text-sm" />
                        <input type="number" name="qtc" value={findings.qtc} onChange={handleInputChange} placeholder={T.ecgQtcInterval} className="p-2 border border-gray-300 rounded-md text-black bg-white text-sm" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">{T.ecgStSegment}</label>
                    <select name="stSegment" value={findings.stSegment} onChange={handleInputChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white">
                        <option>Normal</option><option>ST Elevation</option><option>ST Depression</option><option>Non-specific changes</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">{T.ecgOtherFindings}</label>
                    <textarea name="other" value={findings.other} onChange={handleInputChange} rows={2} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">{T.uploadEcgLabel}</label>
                     <label 
                        onDragEnter={handleDragEvents} onDragOver={handleDragEvents} onDragLeave={handleDragEvents} onDrop={handleDrop}
                        className={`mt-1 flex justify-center items-center w-full h-32 px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md cursor-pointer transition ${isDragOver ? 'border-brand-blue bg-blue-50' : 'bg-white'}`}
                    >
                        {file ? (
                            <div className="text-center">
                                <img src={file.url} alt="ECG Preview" className="max-h-24 mx-auto mb-2" />
                                <p className="text-xs text-gray-500 truncate max-w-xs">{file.name}</p>
                            </div>
                        ) : (
                            <div className="space-y-1 text-center">
                                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                <div className="flex text-sm text-gray-600"><p className="pl-1">{T.uploadEcgPrompt}</p></div>
                                <p className="text-xs text-gray-500">{T.uploadEcgVideoNote}</p>
                            </div>
                        )}
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleFileChange} />
                    </label>
                </div>
            </div>
             <button
                onClick={handleInterpret}
                disabled={isInterpreting}
                className="w-full flex items-center justify-center space-x-2 bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                {isInterpreting ? (
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333V17a1.5 1.5 0 01-3 0v-6.667a1.5 1.5 0 013 0zM10 3a1.5 1.5 0 013 0v14a1.5 1.5 0 01-3 0V3zM14 6.667V17a1.5 1.5 0 01-3 0V6.667a1.5 1.5 0 013 0zM18 10.5a1.5 1.5 0 013 0v6a1.5 1.5 0 01-3 0v-6z" /></svg>
                )}
                <span>{isInterpreting ? T.interpretingEcgMessage : T.interpretEcgButton}</span>
            </button>
            {(isInterpreting || interpretationResult || error) && (
                <div className="mt-4 p-4 bg-white border border-slate-300 rounded-lg animate-fade-in">
                    <h3 className="text-md font-bold text-brand-blue">{T.interpretationResultTitle}</h3>
                    {isInterpreting && <p className="text-sm text-gray-500">{T.interpretingEcgMessage}</p>}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    {interpretationResult && (
                        <div 
                            className="mt-2 text-sm text-gray-700 whitespace-pre-wrap prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: interpretationResult.replace(/## (.*)/g, '<h4 class="text-base font-semibold text-gray-800 mt-3">$1</h4>').replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>') }} 
                        />
                    )}
                </div>
            )}
        </div>
    );
};