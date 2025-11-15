import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateSpeech } from '../services/geminiService';

// --- Audio Decoding Helper Functions ---
// Decodes a base64 string into a Uint8Array.
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Decodes raw PCM audio data into an AudioBuffer for playback.
async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}


interface TextToSpeechPlayerProps {
    textToRead: string;
    language: string; // Keep language for potential future use, though Gemini voices are not strictly language-locked
}

const geminiVoices = [
    { name: 'Zephyr', id: 'Zephyr' },
    { name: 'Kore', id: 'Kore' },
    { name: 'Puck', id: 'Puck' },
    { name: 'Charon', id: 'Charon' },
    { name: 'Fenrir', id: 'Fenrir' },
];

const tones = [
    { name: 'Normal', id: 'Normal' },
    { name: 'Cheerful', id: 'Cheerful' },
    { name: 'Sad', id: 'Sad' },
    { name: 'Excited', id: 'Excited' },
    { name: 'Formal', id: 'Formal' },
];

const speeds = [
    { name: 'Slow', id: 'Slow' },
    { name: 'Normal', id: 'Normal' },
    { name: 'Fast', id: 'Fast' },
];


export const TextToSpeechPlayer: React.FC<TextToSpeechPlayerProps> = ({ textToRead, language }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const [selectedVoice, setSelectedVoice] = useState(geminiVoices[0].id);
    const [selectedTone, setSelectedTone] = useState(tones[0].id);
    const [selectedSpeed, setSelectedSpeed] = useState(speeds[1].id);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const handleStop = useCallback(() => {
        if (audioSourceNodeRef.current) {
            audioSourceNodeRef.current.onended = null; // Prevent onended from firing on manual stop
            audioSourceNodeRef.current.stop();
            audioSourceNodeRef.current = null;
        }
        setIsPlaying(false);
    }, []);

    const handlePlay = async () => {
        if (isPlaying) {
            handleStop();
            return;
        }

        setIsLoading(true);
        setError(null);
        
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            
            let textForApi = textToRead;
            if (selectedTone !== 'Normal') {
                textForApi = `(Speaking in a ${selectedTone.toLowerCase()} tone) ${textToRead}`;
            }

            const base64Audio = await generateSpeech(textForApi, selectedVoice);
            const decodedBytes = decode(base64Audio);
            const audioBuffer = await decodeAudioData(decodedBytes, audioContextRef.current, 24000, 1);
            
            handleStop();

            const source = audioContextRef.current.createBufferSource();
            
            const speedMap = { 'Slow': 0.85, 'Normal': 1.0, 'Fast': 1.15 };
            source.playbackRate.value = speedMap[selectedSpeed as keyof typeof speedMap] || 1.0;

            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            source.start();
            
            source.onended = () => {
                setIsPlaying(false);
                audioSourceNodeRef.current = null;
            };

            audioSourceNodeRef.current = source;
            setIsPlaying(true);
        } catch (err: any) {
            console.error("TTS Error:", err);
            setError(err.message || 'Playback failed.');
        } finally {
            setIsLoading(false);
        }
    };

    // Cleanup effect: stop audio when the component unmounts or text changes
    useEffect(() => {
        return () => {
            handleStop();
        };
    }, [textToRead, handleStop]);
    
    // Effect to handle clicks outside the menu to close it
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);

    const handleOptionSelect = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
        setter(value);
        setIsMenuOpen(false);
    };

    const OptionGroup: React.FC<{ title: string; options: {id: string, name: string}[]; selected: string; onSelect: (value: string) => void; }> = ({ title, options, selected, onSelect }) => (
        <div className="p-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-2">{title}</h4>
            <div className="space-y-1">
                {options.map(opt => (
                    <button
                        key={opt.id}
                        onClick={() => onSelect(opt.id)}
                        className={`w-full text-left text-sm px-2 py-1 rounded-md transition ${selected === opt.id ? 'bg-brand-blue text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                        {opt.name}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="flex items-center space-x-1">
            <button onClick={handlePlay} disabled={isLoading || !!error} className="text-brand-blue hover:text-blue-600 transition disabled:text-gray-400 disabled:cursor-not-allowed p-1" aria-label={isPlaying ? "Stop" : "Play"}>
                {isLoading ? (
                     <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 8a2 2 0 00-2 2v.001a2 2 0 002 2h4a2 2 0 002-2V10a2 2 0 00-2-2H8z" clipRule="evenodd" /></svg>
                ) : error ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                )}
            </button>
            <div className="relative" ref={menuRef}>
                <button
                    onClick={() => setIsMenuOpen(prev => !prev)}
                    disabled={isLoading || isPlaying}
                    className="p-1 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue disabled:text-gray-300 transition"
                    aria-label="Speech settings"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                </button>
                {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-20 animate-fade-in divide-y divide-gray-100">
                        <OptionGroup title="Voice" options={geminiVoices} selected={selectedVoice} onSelect={(val) => handleOptionSelect(setSelectedVoice, val)} />
                        <OptionGroup title="Tone" options={tones} selected={selectedTone} onSelect={(val) => handleOptionSelect(setSelectedTone, val)} />
                        <OptionGroup title="Speed" options={speeds} selected={selectedSpeed} onSelect={(val) => handleOptionSelect(setSelectedSpeed, val)} />
                    </div>
                )}
            </div>
        </div>
    );
};
