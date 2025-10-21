import React, { useState } from 'react';

// IMPORTANT: Replace with your actual Google Form details
// 1. Create a Google Form with questions matching the form fields below.
// 2. Get the pre-filled link. The URL will look like: https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform?usp=pp_url&entry.123=...
// 3. Replace the GOOGLE_FORM_URL with `https://docs.google.com/forms/d/e/YOUR_FORM_ID/formResponse`
// 4. Replace the entry IDs in ENTRY_IDS with the 'entry.xxxx' numbers from your pre-filled link.
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXXX/formResponse";
const ENTRY_IDS = {
  role: "entry.1000001",
  satisfaction: "entry.1000002",
  mostUseful: "entry.1000003",
  leastUseful: "entry.1000004",
  recommend: "entry.1000005",
  suggestions: "entry.1000006",
};

interface EvaluationScreenProps {
    T: Record<string, any>;
}

export const EvaluationScreen: React.FC<EvaluationScreenProps> = ({ T }) => {
    const [formData, setFormData] = useState({
        role: '',
        satisfaction: 0,
        mostUseful: '',
        leastUseful: '',
        recommend: 0,
        suggestions: '',
    });
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        params.append(ENTRY_IDS.role, formData.role);
        params.append(ENTRY_IDS.satisfaction, formData.satisfaction.toString());
        params.append(ENTRY_IDS.mostUseful, formData.mostUseful);
        params.append(ENTRY_IDS.leastUseful, formData.leastUseful);
        params.append(ENTRY_IDS.recommend, formData.recommend.toString());
        params.append(ENTRY_IDS.suggestions, formData.suggestions);
        
        const submissionUrl = `${GOOGLE_FORM_URL}?${params.toString()}`;
        
        // Open in a new tab to submit. The user can close it after.
        window.open(submissionUrl, '_blank');
        
        setIsSubmitted(true);
    };

    if (isSubmitted) {
        return (
            <div className="flex-grow flex items-center justify-center p-8 bg-white rounded-lg shadow-lg border border-gray-200 text-center">
                <div>
                    <svg className="mx-auto h-16 w-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h2 className="mt-4 text-2xl font-bold text-gray-800">{T.evalThankYouTitle}</h2>
                    <p className="mt-2 text-md text-gray-600 max-w-xl mx-auto">{T.evalThankYouMessage}</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="flex-grow flex items-center justify-center p-4 sm:p-8 animate-fade-in">
             <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-6 sm:p-8 w-full max-w-2xl">
                <h2 className="text-2xl font-bold text-gray-800 text-center">{T.evalTitle}</h2>
                <p className="mt-2 text-md text-gray-600 text-center">{T.evalSubtitle}</p>
                <p className="mt-1 text-xs text-gray-500 text-center">{T.evalInstructions}</p>
                
                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    {/* Role */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.evalRoleLabel}</label>
                        <select name="role" value={formData.role} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue">
                            <option value="" disabled>{T.evalSelectOption}</option>
                            <option value="Medical Student">{T.evalRoleStudent}</option>
                            <option value="Resident/Junior Doctor">{T.evalRoleResident}</option>
                            <option value="Attending Physician/Consultant">{T.evalRoleConsultant}</option>
                            <option value="Nurse/Nurse Practitioner">{T.evalRoleNurse}</option>
                            <option value="Other Healthcare Professional">{T.evalRoleOther}</option>
                        </select>
                    </div>

                    {/* Satisfaction */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.evalSatisfactionLabel}</label>
                        <div className="mt-2 flex justify-center space-x-2">
                            {[1, 2, 3, 4, 5].map(star => (
                                <button key={star} type="button" onClick={() => setFormData(p => ({...p, satisfaction: star}))} className={`text-3xl transition-colors duration-150 ${star <= formData.satisfaction ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300'}`} aria-label={`${star} out of 5 stars`}>★</button>
                            ))}
                        </div>
                    </div>
                    
                     {/* Recommend */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.evalRecommendLabel}</label>
                         <div className="mt-2 flex justify-between px-1">
                            <span className="text-xs text-gray-500">{T.evalNotLikely}</span>
                            <span className="text-xs text-gray-500">{T.evalVeryLikely}</span>
                        </div>
                        <div className="mt-1 grid grid-cols-10 gap-1">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                <button key={num} type="button" onClick={() => setFormData(p => ({...p, recommend: num}))} className={`h-10 border rounded transition ${num <= formData.recommend ? 'bg-brand-blue text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{num}</button>
                            ))}
                        </div>
                    </div>

                    {/* Text fields */}
                    <div>
                        <label htmlFor="mostUseful" className="block text-sm font-medium text-gray-700">{T.evalMostUsefulLabel}</label>
                        <input type="text" id="mostUseful" name="mostUseful" value={formData.mostUseful} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue" />
                    </div>
                     <div>
                        <label htmlFor="leastUseful" className="block text-sm font-medium text-gray-700">{T.evalLeastUsefulLabel}</label>
                        <input type="text" id="leastUseful" name="leastUseful" value={formData.leastUseful} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue" />
                    </div>
                    <div>
                        <label htmlFor="suggestions" className="block text-sm font-medium text-gray-700">{T.evalSuggestionsLabel}</label>
                        <textarea id="suggestions" name="suggestions" value={formData.suggestions} onChange={handleChange} rows={4} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue" />
                    </div>

                    <div className="text-center">
                        <button type="submit" className="w-full sm:w-auto bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-8 rounded-md transition duration-300">{T.evalSubmitButton}</button>
                    </div>
                </form>
             </div>
        </div>
    );
};
