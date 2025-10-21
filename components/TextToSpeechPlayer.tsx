import React, { useState, useEffect, useCallback } from 'react';

interface TextToSpeechPlayerProps {
    textToRead: string;
    language: string;
}

export const TextToSpeechPlayer: React.FC<TextToSpeechPlayerProps> = ({ textToRead, language }) => {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | undefined>(undefined);
    const [rate, setRate] = useState(1);
    const [pitch, setPitch] = useState(1);

    const populateVoiceList = useCallback(() => {
        const availableVoices = window.speechSynthesis.getVoices();
        const filteredVoices = availableVoices.filter(voice => voice.lang.startsWith(language));
        setVoices(filteredVoices.length > 0 ? filteredVoices : availableVoices);
        if (filteredVoices.length > 0) {
            setSelectedVoiceURI(filteredVoices[0].voiceURI);
        } else if(availableVoices.length > 0) {
            setSelectedVoiceURI(availableVoices.find(v => v.default)?.voiceURI || availableVoices[0].voiceURI);
        }
    }, [language]);

    useEffect(() => {
        populateVoiceList();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = populateVoiceList;
        }
        
        return () => {
            window.speechSynthesis.cancel();
        };
    }, [populateVoiceList]);
    
    useEffect(() => {
        return () => {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
        };
    }, [textToRead]);
    
    const handlePlayPause = () => {
        if (isSpeaking) {
            window.speechSynthesis.pause();
            setIsSpeaking(false);
        } else {
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            } else {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(textToRead);
                const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                }
                utterance.lang = language;
                utterance.rate = rate;
                utterance.pitch = pitch;
                utterance.onend = () => setIsSpeaking(false);
                utterance.onerror = (e) => {
                    console.error("SpeechSynthesis Error:", e);
                    setIsSpeaking(false);
                };
                window.speechSynthesis.speak(utterance);
            }
            setIsSpeaking(true);
        }
    };

    return (
        <div className="flex items-center space-x-2">
            <button onClick={handlePlayPause} className="text-brand-blue hover:text-blue-600 transition" aria-label={isSpeaking ? "Pause" : "Play"}>
                {isSpeaking ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                )}
            </button>
            <div className="flex items-center border border-gray-200 rounded-md p-1.5 space-x-3 bg-gray-50/50">
                <div className="flex items-center">
                    <label htmlFor="rate-control" className="text-xs text-gray-600 font-medium mr-1.5" title="Playback Speed">Speed</label>
                    <input 
                        id="rate-control"
                        type="range" 
                        min="0.5" 
                        max="2" 
                        step="0.1" 
                        value={rate} 
                        onChange={(e) => setRate(parseFloat(e.target.value))}
                        className="w-16 h-1 accent-brand-blue"
                    />
                    <span className="text-xs text-gray-500 ml-1.5 w-7 text-right">{rate.toFixed(1)}x</span>
                </div>
                <div className="border-l border-gray-300 h-4"></div>
                <div className="flex items-center">
                    <label htmlFor="pitch-control" className="text-xs text-gray-600 font-medium mr-1.5" title="Voice Pitch">Tone</label>
                    <input
                        id="pitch-control"
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={pitch}
                        onChange={(e) => setPitch(parseFloat(e.target.value))}
                        className="w-16 h-1 accent-indigo-500"
                    />
                    <span className="text-xs text-gray-500 ml-1.5 w-7 text-right">{pitch.toFixed(1)}</span>
                </div>
            </div>
        </div>
    );
};
