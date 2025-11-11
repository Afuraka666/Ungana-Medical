import React, { useState, useEffect, useMemo } from 'react';

// IMPORTANT: Replace with your actual Google Form details
// 1. Create a Google Form with questions matching the form fields below.
// 2. Get the pre-filled link to find your Form ID and entry IDs.
// 3. Replace the GOOGLE_FORM_URL with `https://docs.google.com/forms/d/e/YOUR_UNIQUE_FORM_ID_HERE/formResponse`
// 4. Replace the entry IDs below with the 'entry.xxxx' numbers from your form.
//
// --- Directing Responses to Google Drive ---
// To save all form submissions to a specific folder in your Google Drive:
// a. Open your Google Form and go to the "Responses" tab.
// b. Click the "Link to Sheets" icon (a green spreadsheet icon).
// c. Choose "Create a new spreadsheet". Name it "Synapsis Medical Evaluation Responses".
// d. Click "Create". This will automatically save all future responses to this new Google Sheet.
// e. Go to your Google Drive, create a new folder named "Synapsis Medical Evaluation", and move the newly created spreadsheet into it.
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
}

const susQuestions = [
    { key: 'sus1', text: "I think that I would like to use this app frequently." },
    { key: 'sus2', text: "I found the app unnecessarily complex." },
    { key: 'sus3', text: "I thought the app was easy to use." },
    { key: 'sus4', text: "I think I would need technical support to use this app." },
    { key: 'sus5', text: "I found the functions in the app were well integrated." },
    { key: 'sus6', text: "I thought there was too much inconsistency in the app." },
    { key: 'sus7', text: "I would imagine most people would learn to use this app quickly." },
    { key: 'sus8', text: "I found the app very cumbersome to use." },
    { key: 'sus9', text: "I felt very confident using the app." },
    { key: 'sus10', text: "I needed to learn many things before I could get going with the app." },
];

const mauqQuestions = [
    { key: 'mauq1', text: "The app is easy to navigate." },
    { key: 'mauq2', text: "It is easy to learn how to use the app." },
    { key: 'mauq3', text: "I am satisfied with how the app functions." },
    { key: 'mauq4', text: "The app’s information is logically arranged." },
    { key: 'mauq5', text: "The interface design is clear and visually appealing." },
    { key: 'mauq6', text: "The icons and text are easy to read." },
    { key: 'mauq7', text: "The app supports my clinical decision-making process." },
    { key: 'mauq8', text: "The information provided is accurate and clinically relevant." },
    { key: 'mauq9', text: "The app helps me perform tasks more efficiently." },
    { key: 'mauq10', text: "Using the app would improve patient safety." },
    { key: 'mauq11', text: "The app fits well within my existing workflow." },
    { key: 'mauq12', text: "I would use this app in my clinical practice." },
    { key: 'mauq13', text: "I would recommend this app to my colleagues." },
];

const satisfactionQuestions = [
    { key: 'satisfaction1', text: "Overall, I am satisfied with this app." },
    { key: 'satisfaction2', text: "I trust the data provided by this app." },
    { key: 'satisfaction3', text: "This app could be integrated into clinical training or workflow." },
    { key: 'satisfaction4', text: "I would continue using this app if available." },
];

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
                    className={`h-10 border rounded transition text-sm ${num <= value ? 'bg-brand-blue text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                    {num}
                </button>
            ))}
        </div>
    </div>
);

export const EvaluationScreen: React.FC<EvaluationScreenProps> = ({ T }) => {
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
    }, [formData]);

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
        
        // This submits in the background. Google Forms will return an error, but the data will be submitted.
        fetch(submissionUrl, { mode: 'no-cors' }).finally(() => {
            setIsSubmitting(false);
            setIsSubmitted(true);
        });
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
             <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-6 sm:p-8 w-full max-w-4xl">
                <h2 className="text-2xl font-bold text-gray-800 text-center">Evaluation of Synapsis Medical: Clinical Usability and Acceptability Study</h2>
                <p className="mt-2 text-sm text-gray-600 text-center">You are invited to participate in a research study evaluating the usability and clinical applicability of Synapsis Medical. Your participation is voluntary and anonymous. Estimated time: 8–10 minutes. By proceeding, you consent to participate.</p>
                
                <form onSubmit={handleSubmit} className="mt-8">
                    {/* Section A: Consent */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Do you consent to participate in this study? *</label>
                        <div className="flex items-center space-x-4">
                           <label className="flex items-center"><input type="radio" name="consent" value="yes" onChange={(e) => setConsent(e.target.value)} className="mr-2" /> Yes, I consent.</label>
                           <label className="flex items-center"><input type="radio" name="consent" value="no" onChange={(e) => setConsent(e.target.value)} className="mr-2" /> No, I do not consent.</label>
                        </div>
                    </div>
                    { consent === 'no' && <p className="mt-4 text-center text-gray-600">Thank you for your time. You may now close this window.</p>}
                    
                    { consent === 'yes' && (
                        <>
                         <FormSection title="Section B: Demographics">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700">What is your current professional role? *</label><select name="professionalRole" value={formData.professionalRole} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>Select role...</option><option>Consultant anaesthesiologist</option><option>Registrar/resident</option><option>Medical officer</option><option>Nurse anaesthetist</option><option value="Other">Other (please specify)</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700">Years of clinical experience *</label><select name="yearsExperience" value={formData.yearsExperience} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>Select years...</option><option>{"<2 years"}</option><option>2–5 years</option><option>6–10 years</option><option>{">10 years"}</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700">Experience using medical or decision-support apps *</label><select name="appExperience" value={formData.appExperience} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>Select experience...</option><option>None</option><option>Occasional use</option><option>Regular use</option><option>Daily use in clinical settings</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700">Device used for testing *</label><select name="deviceUsed" value={formData.deviceUsed} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>Select device...</option><option>Android phone</option><option>iPhone</option><option>Tablet (Android/iPad)</option><option value="Other">Other (specify)</option></select></div>
                                {formData.deviceUsed === 'Other' && <div><label className="block text-sm font-medium text-gray-700">Please specify other device *</label><input type="text" name="otherDevice" value={formData.otherDevice} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>}
                                <div><label className="block text-sm font-medium text-gray-700">Approximate time spent using the app before evaluation *</label><select name="durationOfUse" value={formData.durationOfUse} onChange={handleChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black"><option value="" disabled>Select duration...</option><option>{"<10 minutes"}</option><option>10–30 minutes</option><option>30–60 minutes</option><option>{">1 hour"}</option></select></div>
                            </div>
                        </FormSection>

                        <FormSection title="Section C: System Usability Scale (SUS)">
                            {susQuestions.map(({key, text}) => (<div key={key}><label className="block text-sm font-medium text-gray-700 mb-2">{text} *</label><LinearScale scale={5} value={formData[key]} onChange={(v) => handleScaleChange(key, v)} startLabel="Strongly Disagree" endLabel="Strongly Agree" /></div>))}
                        </FormSection>
                        
                        <FormSection title="Section D: Mobile App Usability Questionnaire (MAUQ)">
                             {mauqQuestions.map(({key, text}) => (<div key={key}><label className="block text-sm font-medium text-gray-700 mb-2">{text} *</label><LinearScale scale={7} value={formData[key]} onChange={(v) => handleScaleChange(key, v)} startLabel="Strongly Disagree" endLabel="Strongly Agree" /></div>))}
                        </FormSection>

                         <FormSection title="Section E: Satisfaction">
                             {satisfactionQuestions.map(({key, text}) => (<div key={key}><label className="block text-sm font-medium text-gray-700 mb-2">{text} *</label><LinearScale scale={5} value={formData[key]} onChange={(v) => handleScaleChange(key, v)} startLabel="Strongly Disagree" endLabel="Strongly Agree" /></div>))}
                        </FormSection>

                        <FormSection title="Section F: Feedback">
                            <div><label htmlFor="feedbackMostUseful" className="block text-sm font-medium text-gray-700">What aspects of the app did you find most useful?</label><textarea id="feedbackMostUseful" name="feedbackMostUseful" value={formData.feedbackMostUseful} onChange={handleChange} rows={3} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
                            <div><label htmlFor="feedbackImprovements" className="block text-sm font-medium text-gray-700">What aspects of the app need improvement?</label><textarea id="feedbackImprovements" name="feedbackImprovements" value={formData.feedbackImprovements} onChange={handleChange} rows={3} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
                            <div><label htmlFor="feedbackBugs" className="block text-sm font-medium text-gray-700">Did you encounter any bugs, errors, or crashes? Please describe.</label><input type="text" id="feedbackBugs" name="feedbackBugs" value={formData.feedbackBugs} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
                            <div><label htmlFor="feedbackFeatures" className="block text-sm font-medium text-gray-700">Are there any features you would like to see added?</label><textarea id="feedbackFeatures" name="feedbackFeatures" value={formData.feedbackFeatures} onChange={handleChange} rows={3} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
                            <div><label htmlFor="feedbackAdditional" className="block text-sm font-medium text-gray-700">Any additional comments or suggestions?</label><textarea id="feedbackAdditional" name="feedbackAdditional" value={formData.feedbackAdditional} onChange={handleChange} rows={3} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black" /></div>
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
    );
};