import React, { useState, useEffect, useMemo } from 'react';
import type { Tip, InteractionState } from '../types';

interface TipsCarouselProps {
    interactionState: InteractionState;
    T: Record<string, any>;
}

const allTips = (T: Record<string, any>): Tip[] => [
    {
        id: 'explore-nodes',
        title: T.tipExploreNodesTitle,
        text: T.tipExploreNodesText,
        trigger: (state) => state.caseGenerated && !state.caseEdited && state.nodeClicks < 2,
    },
    {
        id: 'edit-case',
        title: T.tipEditCaseTitle,
        text: T.tipEditCaseText,
        trigger: (state) => state.caseGenerated && !state.caseEdited,
    },
    {
        id: 'undo-redo',
        title: T.tipUndoRedoTitle,
        text: T.tipUndoRedoText,
        trigger: (state) => state.caseEdited && !state.caseSaved,
    },
    {
        id: 'save-case',
        title: T.tipSaveCaseTitle,
        text: T.tipSaveCaseText,
        trigger: (state) => state.caseGenerated && !state.caseSaved,
    },
    {
        id: 'save-snippet',
        title: T.tipSaveSnippetTitle,
        text: T.tipSaveSnippetText,
        trigger: (state) => state.caseGenerated && !state.snippetSaved,
    },
    {
        id: 'fullscreen-map',
        title: T.tipFullscreenTitle,
        text: T.tipFullscreenText,
        trigger: (state) => state.nodeClicks > 4,
    },
];

export const TipsCarousel: React.FC<TipsCarouselProps> = ({ interactionState, T }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dismissedTips, setDismissedTips] = useState<string[]>([]);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        try {
            const storedDismissed = localStorage.getItem('synapsis_dismissed_tips');
            if (storedDismissed) {
                setDismissedTips(JSON.parse(storedDismissed));
            }
        } catch (e) {
            console.error('Failed to parse dismissed tips from localStorage', e);
        }
    }, []);

    const activeTips = useMemo(() => {
        return allTips(T).filter(tip => tip.trigger(interactionState) && !dismissedTips.includes(tip.id));
    }, [interactionState, dismissedTips, T]);

    useEffect(() => {
        setCurrentIndex(0);
    }, [activeTips.length]);

    const handleDismissTip = (tipId: string) => {
        const newDismissed = [...dismissedTips, tipId];
        setDismissedTips(newDismissed);
        localStorage.setItem('synapsis_dismissed_tips', JSON.stringify(newDismissed));
        if (activeTips.length <= 1) {
            setIsVisible(false);
        }
    };
    
    const handleDismissCarousel = () => {
        setIsVisible(false);
    }

    const handleNext = () => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % activeTips.length);
    };

    const handlePrev = () => {
        setCurrentIndex((prevIndex) => (prevIndex - 1 + activeTips.length) % activeTips.length);
    };

    if (!isVisible || activeTips.length === 0) {
        return null;
    }

    const currentTip = activeTips[currentIndex];

    return (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center space-x-3 animate-fade-in relative">
            <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 14.464A1 1 0 106.465 13.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 11a1 1 0 100-2H4a1 1 0 100 2h1zM4.54 5.05l.707-.707a1 1 0 10-1.414-1.414l-.707.707a1 1 0 101.414 1.414z" />
                </svg>
            </div>
            <div className="flex-grow min-w-0">
                <p className="text-sm font-semibold text-gray-800">{currentTip.title}</p>
                <p className="text-xs text-gray-600 truncate">{currentTip.text}</p>
            </div>
            <div className="flex items-center flex-shrink-0 space-x-1">
                {activeTips.length > 1 && (
                    <>
                        <button onClick={handlePrev} className="p-1 rounded-full hover:bg-blue-100 text-gray-500 hover:text-gray-800 transition">
                            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        </button>
                        <span className="text-xs text-gray-500">{currentIndex + 1}/{activeTips.length}</span>
                        <button onClick={handleNext} className="p-1 rounded-full hover:bg-blue-100 text-gray-500 hover:text-gray-800 transition">
                            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                        </button>
                    </>
                )}
                 <button onClick={() => handleDismissTip(currentTip.id)} title="Dismiss this tip" className="p-1.5 rounded-full hover:bg-blue-100 text-gray-500 hover:text-gray-800 transition">
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                 </button>
            </div>
        </div>
    );
};
