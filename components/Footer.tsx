import React from 'react';

interface FooterProps {
    T: Record<string, any>;
    evaluationDaysRemaining: number | null;
    onOpenFeedback: () => void;
    className?: string;
}

export const Footer: React.FC<FooterProps> = ({ T, evaluationDaysRemaining, onOpenFeedback, className }) => {
    const currentYear = new Date().getFullYear();

    return (
        <footer className={`bg-gray-200 text-xs text-gray-600 p-3 border-t border-gray-300 ${className || ''}`}>
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-center sm:justify-between items-center gap-2">
                <span className="hidden sm:block flex-1 text-left">© {currentYear} Ungana Medical. All rights reserved.</span>
                
                <button 
                    onClick={onOpenFeedback} 
                    className="flex-shrink-0 flex items-center space-x-1.5 text-gray-600 hover:text-brand-blue font-semibold transition duration-200"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                       <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.832 8.832 0 01-4.323-.972l-3.35 1.116a.5.5 0 01-.63-.63l1.116-3.35A8.832 8.832 0 012 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM4.445 13.046a.5.5 0 01.373.636l-.743 2.228 2.228-.743a.5.5 0 01.636.373A6.96 6.96 0 0010 16a6 6 0 100-12 6.96 6.96 0 00-2.932.652.5.5 0 01-.636.373l-2.228-.743.743 2.228a.5.5 0 01-.373.636A6.968 6.968 0 004 10a6.968 6.968 0 00.445 3.046z" clipRule="evenodd" />
                    </svg>
                    <span>{T.feedbackButton}</span>
                </button>
                
                <div className="text-center sm:flex-1 sm:text-right">
                    {evaluationDaysRemaining !== null && (
                        <span className="font-semibold text-brand-blue">
                            {evaluationDaysRemaining > 0
                                ? T.trialDaysRemaining(evaluationDaysRemaining)
                                : T.evalPeriodEnded}
                        </span>
                    )}
                </div>
            </div>
        </footer>
    );
};