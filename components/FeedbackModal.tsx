import React, { useState } from 'react';

// IMPORTANT: Replace with your actual Google Form details for feedback
// 1. Create a Google Form for feedback (e.g., fields for type, text, email).
// 2. Get the pre-filled link to find your Form ID and entry IDs.
// 3. Replace the GOOGLE_FORM_URL with `https://docs.google.com/forms/d/e/YOUR_UNIQUE_FORM_ID_HERE/formResponse`
// 4. Replace the entry IDs in ENTRY_IDS with the 'entry.xxxx' numbers from your form.
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/YOUR_UNIQUE_FORM_ID_HERE/formResponse";
const ENTRY_IDS = {
  feedbackType: "entry.2000001",
  feedbackText: "entry.2000002",
  email: "entry.2000003",
};

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    T: Record<string, any>;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, T }) => {
    const [formData, setFormData] = useState({
        feedbackType: 'suggestion',
        feedbackText: '',
        email: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        const params = new URLSearchParams();
        params.append(ENTRY_IDS.feedbackType, formData.feedbackType);
        params.append(ENTRY_IDS.feedbackText, formData.feedbackText);
        params.append(ENTRY_IDS.email, formData.email);

        try {
            // Using fetch to submit in the background to avoid opening a new tab
            await fetch(GOOGLE_FORM_URL, {
                method: 'POST',
                mode: 'no-cors', // Important for submitting to Google Forms
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });
            setIsSubmitted(true);
        } catch (err) {
            console.error('Feedback submission error:', err);
            setError(T.feedbackError);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleCloseAndReset = () => {
        setFormData({ feedbackType: 'suggestion', feedbackText: '', email: '' });
        setIsSubmitted(false);
        setIsSubmitting(false);
        setError('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">{T.feedbackTitle}</h2>
                    <button onClick={handleCloseAndReset} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </header>
                
                <main className="p-6 overflow-y-auto flex-grow">
                    {isSubmitted ? (
                        <div className="text-center py-8">
                             <svg className="mx-auto h-16 w-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <h3 className="mt-4 text-xl font-bold text-gray-800">{T.feedbackThankYouTitle}</h3>
                            <p className="mt-2 text-md text-gray-600">{T.feedbackThankYouMessage}</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="feedbackType" className="block text-sm font-medium text-gray-700">{T.feedbackTypeLabel}</label>
                                <select id="feedbackType" name="feedbackType" value={formData.feedbackType} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue text-black">
                                    <option value="suggestion">{T.feedbackTypeSuggestion}</option>
                                    <option value="issue">{T.feedbackTypeIssue}</option>
                                    <option value="general">{T.feedbackTypeGeneral}</option>
                                </select>
                            </div>
                             <div>
                                <label htmlFor="feedbackText" className="block text-sm font-medium text-gray-700">{T.feedbackTextLabel}</label>
                                <textarea id="feedbackText" name="feedbackText" value={formData.feedbackText} onChange={handleChange} rows={5} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue text-black" placeholder={T.feedbackTextPlaceholder}></textarea>
                            </div>
                             <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">{T.feedbackEmailLabel}</label>
                                <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue text-black" placeholder={T.feedbackEmailPlaceholder} />
                            </div>
                            {error && <p className="text-sm text-red-600">{error}</p>}
                        </form>
                    )}
                </main>

                 <footer className="p-4 border-t border-gray-200 text-right bg-gray-50 space-x-3">
                    <button 
                        onClick={handleCloseAndReset} 
                        className="bg-white hover:bg-gray-100 text-gray-700 font-bold py-2 px-4 rounded-md border border-gray-300 transition duration-300"
                    >
                        {isSubmitted ? T.closeButton : T.cancelButton}
                    </button>
                    {!isSubmitted && (
                        <button 
                            type="submit"
                            onClick={handleSubmit}
                            disabled={isSubmitting || !formData.feedbackText.trim()}
                            className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-md transition duration-300 disabled:bg-gray-400"
                        >
                            {isSubmitting ? T.submittingButton : T.submitButton}
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
}