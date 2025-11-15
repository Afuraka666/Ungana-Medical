
import React, { useState, useEffect, useMemo } from 'react';

// IMPORTANT: Replace with your actual Google Form details
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/YOUR_UNIQUE_FORM_ID_HERE/formResponse";
const ENTRY_IDS = {
  respondentId: "entry.1000000",
  consent: "entry.1000001",
  professionalRole: "entry.1000002",
  yearsExperience: "entry.1000003",
  appExperience: "entry.1000004",
  deviceUsed: "entry.1000005",
  durationOfUse: "entry.1000006",
  sus1: "entry.1000007", sus2: "entry.1000008", sus3: "entry.1000009", sus4: "entry.1000010", sus5: "entry.1000011",
  sus6: "entry.1000012", sus7: "entry.1000013", sus8: "entry.1000014", sus9: "entry.1000015", sus10: "entry.1000016",
  mauq1: "entry.1000017", mauq2: "entry.1000018", mauq3: "entry.1000019", mauq4: "entry.1000020", mauq5: "entry.1000021",
  mauq6: "entry.1000022", mauq7: "entry.1000023", mauq8: "entry.1000024", mauq9: "entry.1000025", mauq10: "entry.1000026",
  mauq11: "entry.1000027", mauq12: "entry.1000028", mauq13: "entry.1000029",
  satisfaction1: "entry.1000030", satisfaction2: "entry.1000031", satisfaction3: "entry.1000032", satisfaction4: "entry.1000033",
  feedbackMostUseful: "entry.1000034", feedbackImprovements: "entry.1000035", feedbackBugs: "entry.1000036",
  feedbackFeatures: "entry.1000037", feedbackAdditional: "entry.1000038",
};

interface EvaluationScreenProps {
    T: Record<string, any>;
    onFeedbackSubmitted: () => void;
}

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="space-y-4 border-t border-gray-200 pt-6 mt-6">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        {children}
    </div>
);

const LinearScale: React.FC<{ scale: number; value: number; onChange: (value: number) => void; startLabel: string; endLabel: string }> = ({ scale, value, onChange, startLabel, endLabel }) => (
    <div>
        <div className="flex justify-between px-1 text-xs text-gray-500">
            <span>{startLabel}</span>
            <span>{endLabel}</span>
        </div>
        <div className={`mt-1 grid gap-1 grid-cols-${scale > 7 ? '10' : scale}`}>
            {Array.from({ length: scale }, (_, i) => i + 1).map(num => (
                <button
                    key={num}
                    type="button"
                    onClick={() => onChange(num)}
                    className={`h-8 sm:h-10 border rounded transition text-sm ${num <= value ? 'bg-brand-blue text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                    {num}
                </button>
            ))}
        </div>
    </div>
);

export const EvaluationScreen: React.FC<EvaluationScreenProps> = ({ T, onFeedbackSubmitted }) => {
    const [respondentId, setRespondentId] = useState('');
    const [consent, setConsent] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState<any>({
        professionalRole: '', yearsExperience: '', appExperience: '', deviceUsed: '', otherDevice: '', durationOfUse: '',
        sus1: 0, sus2: 0, sus3: 0, sus4: 0, sus5: 0, sus6: 0, sus7: 0, sus8: 0, sus9: 0, sus10: 0,
        mauq1: 0, mauq2: 0, mauq3: 0, mauq4: 0, mauq5: 0, mauq6: 0, mauq7: 0, mauq8: 0, mauq9: 0, mauq10: 0, mauq11: 0, mauq12: 0, mauq13: 0,
        satisfaction1: 0, satisfaction2: 0, satisfaction3: 0, satisfaction4: 0,
        feedbackMostUseful: '', feedbackImprovements: '', feedbackBugs: '', feedbackFeatures: '', feedbackAdditional: '',
    });
    
    const susQuestions = useMemo(() => [
        { key: 'sus1', text: T.sus1 }, { key: 'sus2', text: T.sus2 }, { key: 'sus3', text: T.sus3 },
        { key: 'sus4', text: T.sus4 }, { key: 'sus5', text: T.sus5 }, { key: 'sus6', text: T.sus6 },
        { key: 'sus7', text: T.sus7 }, { key: 'sus8', text: T.sus8 }, { key: 'sus9', text: T.sus9 }, { key: 'sus10', text: T.sus10 },
    ], [T]);

    const mauqQuestions = useMemo(() => [
        { key: 'mauq1', text: T.mauq1 }, { key: 'mauq2', text: T.mauq2 }, { key: 'mauq3', text: T.mauq3 },
        { key: 'mauq4', text: T.mauq4 }, { key: 'mauq5', text: T.mauq5 }, { key: 'mauq6', text: T.mauq6 },
        { key: 'mauq7', text: T.mauq7 }, { key: 'mauq8', text: T.mauq8 }, { key: 'mauq9', text: T.mauq9 },
        { key: 'mauq10', text: T.mauq10 }, { key: 'mauq11', text: T.mauq11 }, { key: 'mauq12', text: T.mauq12 }, { key: 'mauq13', text: T.mauq13 },
    ], [T]);

    const satisfactionQuestions = useMemo(() => [
        { key: 'satisfaction1', text: T.satisfaction1 }, { key: 'satisfaction2', text: T.satisfaction2 },
        { key: 'satisfaction3', text: T.satisfaction3 }, { key: 'satisfaction4', text: T.satisfaction4 },
    ], [T]);


    useEffect(() => {
        let id = localStorage.getItem('synapsis_respondent_id');
        if (!id) {
            id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            localStorage.setItem('synapsis_respondent_id', id);
        }
        setRespondentId(id);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleScaleChange = (key: string, value: number) => {
        setFormData(prev => ({...prev, [key]: value}));
    };

    const isFormComplete = useMemo(() => {
        if (!formData.professionalRole || !formData.yearsExperience || !formData.appExperience || !formData.deviceUsed || !formData.durationOfUse) return false;
        if (formData.deviceUsed === 'Other' && !formData.otherDevice) return false;
        if (susQuestions.some(q => formData[q.key] === 0)) return false;
        if (mauqQuestions.some(q => formData[q.key] === 0)) return false;
        if (satisfactionQuestions.some(q => formData[q.key] === 0)) return false;
        return true;
    }, [formData, susQuestions, mauqQuestions, satisfactionQuestions]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormComplete) return;
        
        setIsSubmitting(true);
        const params = new URLSearchParams();
        params.append(ENTRY_IDS.respondentId, respondentId);
        params.append(ENTRY_IDS.consent, "Yes, I consent.");

        Object.keys(formData).forEach(key => {
            const entryIdKey = key as keyof typeof ENTRY_IDS;
            if (ENTRY_IDS[entryIdKey] && formData[key]) {
                params.append(ENTRY_IDS[entryIdKey], formData[key].toString());
            }
        });
        
        const submissionUrl = `${GOOGLE_FORM_URL}?${params.toString()}`;
        
        fetch(submissionUrl, { mode: 'no-cors' }).finally(() => {
            setIsSubmitting(false);
            setIsSubmitted(true);
            onFeedbackSubmitted();
        });
    };

    if (isSubmitted) {
        return (
             <div className="h-screen w-screen flex items-center justify-center bg-gray-100 p-4">
                <div className="bg-white rounded-lg shadow-lg border border-gray-200 text-center p-8 max-w-lg">
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
        <div className="h-screen w-screen bg-gray-100 overflow-y-auto">
            <div className="flex-grow flex items-center justify-center p-4 sm:p-8 animate-fade-in">
                <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-6 sm:p-8 w-full max-w-4xl">
                    <h2 className="text-2xl font-bold text-gray-800 text-center">{T.evalStudyTitle}</h2>
                    <p className="mt-2 text-sm text-gray-600 text-center">{T.evalStudyDescription}</p>
                    
                    <form onSubmit={handleSubmit} className="mt-8">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{T.evalConsentLabel}</label>
                            <div className="flex items-center space-x-4">
                            <label className="flex items-center"><input type="radio" name="consent" value="yes" onChange={(e) => setConsent(e.target.value)} className="mr-2" /> {T.evalConsentYes}</label>
                            <label className="flex items-center"><input type="radio" name="consent" value="no" onChange={(e) => setConsent(e.target.value)} className="mr-2" /> {T.evalConsentNo}</label>
                            </div>
                        </div>
                        { consent === 'no' && <p className="mt-4 text-center text-gray-600">{T.evalConsentNoMessage}</p>}
                        
                        { consent === 'yes' && (
                            <>
                            <FormSection title={T.evalSectionB}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="block text-sm font-medium text-gray-700">{T.evalRoleLabel}</label><select name="professionalRole" value={formData.professionalRole} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>{T.evalSelectOption}</option><option>{T.evalRoleConsultant}</option><option>{T.evalRoleRegistrar}</option><option>{T.evalRoleMO}</option><option>{T.evalRoleNurseAnaesthetist}</option><option value="Other">{T.evalRoleOther}</option></select></div>
                                    <div><label className="block text-sm font-medium text-gray-700">{T.evalYearsExperienceLabel}</label><select name="yearsExperience" value={formData.yearsExperience} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>Select...</option>{T.evalYearsExperienceOptions.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                                    <div><label className="block text-sm font-medium text-gray-700">{T.evalAppExperienceLabel}</label><select name="appExperience" value={formData.appExperience} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>Select...</option>{T.evalAppExperienceOptions.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                                    <div><label className="block text-sm font-medium text-gray-700">{T.evalDeviceUsedLabel}</label><select name="deviceUsed" value={formData.deviceUsed} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>Select...</option>{T.evalDeviceUsedOptions.map((opt: string) => <option key={opt} value={opt.includes('Other') ? 'Other' : opt}>{opt}</option>)}</select></div>
                                    {formData.deviceUsed === 'Other' && <div><label className="block text-sm font-medium text-gray-700">{T.evalSpecifyDeviceLabel}</label><input type="text" name="otherDevice" value={formData.otherDevice} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>}
                                    <div><label className="block text-sm font-medium text-gray-700">{T.evalDurationOfUseLabel}</label><select name="durationOfUse" value={formData.durationOfUse} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>Select...</option>{T.evalDurationOfUseOptions.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                                </div>
                            </FormSection>

                            <FormSection title={T.evalSectionC}>
                                {susQuestions.map(({key, text}) => (<div key={key}><label className="block text-sm font-medium text-gray-700 mb-2">{text} *</label><LinearScale scale={5} value={formData[key]} onChange={(v) => handleScaleChange(key, v)} startLabel={T.evalSUSScaleStart} endLabel={T.evalSUSScaleEnd} /></div>))}
                            </FormSection>
                            
                            <FormSection title={T.evalSectionD}>
                                {mauqQuestions.map(({key, text}) => (<div key={key}><label className="block text-sm font-medium text-gray-700 mb-2">{text} *</label><LinearScale scale={7} value={formData[key]} onChange={(v) => handleScaleChange(key, v)} startLabel={T.evalMAUQScaleStart} endLabel={T.evalMAUQScaleEnd} /></div>))}
                            </FormSection>

                            <FormSection title={T.evalSectionE}>
                                {satisfactionQuestions.map(({key, text}) => (<div key={key}><label className="block text-sm font-medium text-gray-700 mb-2">{text} *</label><LinearScale scale={5} value={formData[key]} onChange={(v) => handleScaleChange(key, v)} startLabel={T.evalSUSScaleStart} endLabel={T.evalSUSScaleEnd} /></div>))}
                            </FormSection>

                            <FormSection title={T.evalSectionF}>
                                <div><label htmlFor="feedbackMostUseful" className="block text-sm font-medium text-gray-700">{T.evalFeedbackMostUseful}</label><textarea id="feedbackMostUseful" name="feedbackMostUseful" value={formData.feedbackMostUseful} onChange={handleChange} rows={3} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
                                <div><label htmlFor="feedbackImprovements" className="block text-sm font-medium text-gray-700">{T.evalFeedbackImprovements}</label><textarea id="feedbackImprovements" name="feedbackImprovements" value={formData.feedbackImprovements} onChange={handleChange} rows={3} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
                                <div><label htmlFor="feedbackBugs" className="block text-sm font-medium text-gray-700">{T.evalFeedbackBugs}</label><input type="text" id="feedbackBugs" name="feedbackBugs" value={formData.feedbackBugs} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
                                <div><label htmlFor="feedbackFeatures" className="block text-sm font-medium text-gray-700">{T.evalFeedbackFeatures}</label><textarea id="feedbackFeatures" name="feedbackFeatures" value={formData.feedbackFeatures} onChange={handleChange} rows={3} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
                                <div><label htmlFor="feedbackAdditional" className="block text-sm font-medium text-gray-700">{T.evalFeedbackAdditional}</label><textarea id="feedbackAdditional" name="feedbackAdditional" value={formData.feedbackAdditional} onChange={handleChange} rows={3} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
                            </FormSection>

                            <div className="text-center pt-6 mt-6 border-t">
                                <button type="submit" disabled={!isFormComplete || isSubmitting} className="w-full sm:w-auto bg-brand-blue hover:bg-blue-800 text-white font-bold py-3 px-10 rounded-md transition duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed">
                                    {isSubmitting ? 'Submitting...' : T.evalSubmitButton}
                                </button>
                            </div>
                            </>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
};
