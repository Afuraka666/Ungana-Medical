import React from 'react';

interface FooterProps {
    T: Record<string, any>;
    evaluationDaysRemaining: number | null;
}

export const Footer: React.FC<FooterProps> = ({ T, evaluationDaysRemaining }) => {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="bg-gray-200 text-center text-xs text-gray-600 p-3 border-t border-gray-300">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
                <span>© {currentYear} Synapsis Medical. All rights reserved.</span>
                {evaluationDaysRemaining !== null && evaluationDaysRemaining > 0 && (
                    <span className="font-semibold text-brand-blue">
                        {T.trialDaysRemaining(evaluationDaysRemaining)}
                    </span>
                )}
                 {evaluationDaysRemaining === 0 && (
                    <span className="font-semibold text-red-600">
                        {T.evalPeriodEnded}
                    </span>
                )}
            </div>
        </footer>
    );
};