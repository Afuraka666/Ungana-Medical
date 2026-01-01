
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink, TraceableEvidence, FurtherReading, DiagramData, EcgFindings } from '../types';

const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const status = error?.status || error?.response?.status;
            if (status !== 429 && (status < 500 || status >= 600)) {
                throw error;
            }
            const delay = initialDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

const FAST_MODEL = "gemini-3-flash-preview"; 

const SYNTHESIS_GUIDELINE = `
**STRICT PROFESSIONAL MEDICAL SYNTHESIS RULES:**
1. **Clean Formatting:** Remove unnecessary symbols/artifacts. Do NOT use raw LaTeX delimiters ($) for simple variables.
2. **Accurate Symbol Rendering:** Use Unicode for physiological variables (e.g., PaO₂, SaO₂, PvO₂, CO₂, H₂O, P_c, P_i, T½). Use subscripts/superscripts directly in the text.
3. **Formula Handling:** ONLY use LaTeX ($...$) for complex, multi-variable mathematical equations.
4. **Physiological Relevancy (INTEGRATION):** If a physiological graph is relevant to the condition's pathophysiology, you MUST embed the tag [GRAPH: type] at the END of the 'biochemicalPathway.description' field. 
   Available Tags:
   - \`[GRAPH: oxygen_dissociation]\` (ARDS, Anemia, Sepsis, CO Poisoning)
   - \`[GRAPH: frank_starling]\` (CHF, Fluid resuscitation, Shock)
   - \`[GRAPH: pressure_volume_loop]\` (Valvular disease, Heart Failure)
   - \`[GRAPH: cerebral_pressure_volume]\` (TBI, ICH, ICP issues)
   - \`[GRAPH: cerebral_autoregulation]\` (Stroke, Carotid disease, Neuro-anaesthesia)
5. **Narrative Integrity:** No citations/PMIDs in 'patientProfile', 'presentingComplaint', or 'history'. Reads like a clinical record.
6. **Quiz Quality:** Exactly 5 high-yield MCQs.
7. **Phased Management Structuring:** Categorize 'disciplineSpecificConsiderations' into "Preoperative", "Intraoperative", and "Postoperative" (or equivalent acute/recovery phases).
8. **Discipline Authenticity (CRITICAL):** Use technical language specific to the discipline (e.g., NANDA-I for Nursing, Pharmacokinetics for Pharmacology). Do NOT provide generalized medical advice.
9. **Multidisciplinary Spectrum:** Provide 4-6 distinct items covering both Acute Management AND Rehabilitation/Community Re-integration phases.
`;

const diagramNodeSchema = {
    type: Type.OBJECT,
    properties: {
        id: { type: Type.STRING },
        label: { type: Type.STRING },
        description: { type: Type.STRING },
    },
    required: ["id", "label"]
};

const diagramLinkSchema = {
    type: Type.OBJECT,
    properties: {
        source: { type: Type.STRING },
        target: { type: Type.STRING },
        label: { type: Type.STRING }
    },
    required: ["source", "target", "label"]
};

const diagramDataSchema = {
    type: Type.OBJECT,
    properties: {
        nodes: { type: Type.ARRAY, items: diagramNodeSchema },
        links: { type: Type.ARRAY, items: diagramLinkSchema }
    },
    required: ["nodes", "links"],
    nullable: true
};

const educationalContentSchema = {
    type: Type.OBJECT,
    properties: {
        type: { type: Type.STRING, enum: ["Diagram", "Graph", "Formula", "Image"] },
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        reference: { type: Type.STRING },
        diagramData: { ...diagramDataSchema }
    },
    required: ["type", "title", "description", "reference"]
};

const quizQuestionSchema = {
    type: Type.OBJECT,
    properties: {
        question: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctAnswerIndex: { type: Type.INTEGER },
        explanation: { type: Type.STRING }
    },
    required: ["question", "options", "correctAnswerIndex", "explanation"]
};

const corePatientCaseSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        patientProfile: { type: Type.STRING },
        presentingComplaint: { type: Type.STRING },
        history: { type: Type.STRING }
    },
    required: ["title", "patientProfile", "presentingComplaint", "history"]
};

const extendedDetailsSchema = {
    type: Type.OBJECT,
    properties: {
        biochemicalPathway: { ...educationalContentSchema },
        multidisciplinaryConnections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              discipline: { type: Type.STRING },
              connection: { type: Type.STRING },
            },
            required: ["discipline", "connection"],
          },
        },
        disciplineSpecificConsiderations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                aspect: { type: Type.STRING },
                consideration: { type: Type.STRING }
              },
              required: ["aspect", "consideration"]
            }
        }
    },
    required: ["biochemicalPathway", "multidisciplinaryConnections", "disciplineSpecificConsiderations"]
};

const evidenceAndQuizSchema = {
    type: Type.OBJECT,
    properties: {
        traceableEvidence: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    claim: { type: Type.STRING },
                    source: { type: Type.STRING }
                },
                required: ["claim", "source"]
            }
        },
        furtherReadings: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING },
                    reference: { type: Type.STRING }
                },
                required: ["topic", "reference"]
            }
        },
        quiz: { type: Type.ARRAY, items: quizQuestionSchema }
    },
    required: ["traceableEvidence", "furtherReadings", "quiz"]
};

const knowledgeMapSchema = {
    type: Type.OBJECT,
    properties: {
        nodes: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING },
                    discipline: { type: Type.STRING },
                    summary: { type: Type.STRING }
                },
                required: ["id", "label", "discipline", "summary"]
            }
        },
        links: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    source: { type: Type.STRING },
                    target: { type: Type.STRING },
                    description: { type: Type.STRING }
                },
                required: ["source", "target", "description"]
            }
        }
    },
    required: ["nodes", "links"]
};

const extractJson = (text: string) => {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch) return jsonMatch[1].trim();
    return text.trim();
};

export const generateCorePatientCase = async (condition: string, discipline: string, difficulty: string, language: string): Promise<PatientCase> => {
    const ai = getAiClient();
    const prompt = `Senior medical consultant: Create core clinical record for "${condition}". Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}. ${SYNTHESIS_GUIDELINE}`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: corePatientCaseSchema,
            thinkingConfig: { thinkingBudget: 0 }
        },
    }));
    const data = JSON.parse(extractJson(response.text || "{}"));
    return { ...data } as PatientCase;
};

export const generateExtendedDetails = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const ai = getAiClient();
    const prompt = `Provide extended clinical depth for "${coreCase.title}" specifically for the discipline of "${discipline}". 
    
    **MANAGEMENT DEPTH REQUIREMENTS:** 
    For 'disciplineSpecificConsiderations', adopt an expert specialist persona for "${discipline}". Use technical terminology, mention specific tools/scales/protocols unique to this field. 
    STRUCTURE: Use three items with 'aspect' labels matching the relevant clinical phases (e.g., "Preoperative/Initial", "Intraoperative/Ongoing", "Postoperative/Recovery").
    
    **MULTIDISCIPLINARY CONNECTION SPECTRUM:** 
    Synthesize 4-6 distinct multidisciplinary connections. Ensure a logical progression from Acute Management to Rehabilitation and Community Re-integration.
    
    **PHYSIOLOGICAL MODEL VISUALIZATION (CORE REQUIREMENT):** 
    If a physiological graph (oxygen_dissociation, frank_starling, pressure_volume_loop, cerebral_pressure_volume, cerebral_autoregulation) is relevant to the pathophysiology of "${coreCase.title}", you MUST embed the correct [GRAPH: type] tag strictly within the 'biochemicalPathway.description' field.
    
    Language: ${language}. ${SYNTHESIS_GUIDELINE}`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: extendedDetailsSchema,
            thinkingConfig: { thinkingBudget: 0 }
        },
    }));
    return JSON.parse(extractJson(response.text || "{}"));
};

export const generateEvidenceAndQuiz = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const ai = getAiClient();
    const prompt = `References & Quiz for "${coreCase.title}". VERIFY ALL PMIDs/DOIs using tools. Language: ${language}. ${SYNTHESIS_GUIDELINE}`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: evidenceAndQuizSchema,
            thinkingConfig: { thinkingBudget: 0 },
            tools: [{ googleSearch: {} }]
        },
    }));
    const data = JSON.parse(extractJson(response.text || "{}"));
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return { ...data, groundingSources: sources };
};

export const generateKnowledgeMap = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string): Promise<KnowledgeMapData> => {
    const ai = getAiClient();
    const prompt = `Knowledge map (10 connected nodes) for "${coreCase.title}". Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: knowledgeMapSchema,
            thinkingConfig: { thinkingBudget: 0 }
        },
    }));
    const data = JSON.parse(extractJson(response.text || "{}"));
    const validNodeIds = new Set((data as any).nodes?.map((n: KnowledgeNode) => n.id) || []);
    const validLinks = ((data as any).links || []).filter((l: KnowledgeLink) => validNodeIds.has(l.source) && validNodeIds.has(l.target));
    return { nodes: (data as any).nodes || [], links: validLinks };
};

export const searchForSource = async (sourceQuery: string, language: string): Promise<{ summary: string; sources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Verified technical research for "${sourceQuery}". Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
    }));
    return { summary: response.text || "", sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] };
};

export const interpretEcg = async (findings: EcgFindings, imageBase64: string | null, imageMimeType: string | null, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `ECG Report. Findings: ${JSON.stringify(findings)}. Language: ${language}.`;
    const contentParts: any[] = [{ text: prompt }];
    if (imageBase64 && imageMimeType) contentParts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: { parts: contentParts },
        config: { thinkingConfig: { thinkingBudget: 0 } }
    }));
    return response.text || "";
};

export const generateVisualAid = async (prompt: string): Promise<string> => {
    const ai = getAiClient();
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: '4:3' } },
    }));
    const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error("Visual aid failed.");
    return data;
};

export const checkDrugInteractions = async (drugNames: string[], language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Drug interactions for: ${drugNames.join(', ')}. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } }
    }));
    return response.text || "";
};

export const generateSpeech = async (text: string, voiceName: string): Promise<string> => {
    const ai = getAiClient();
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
    }));
    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) throw new Error("Speech failed.");
    return data;
};

export const getConceptAbstract = async (concept: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Significance: "${concept}" in context of "${caseContext}". 50 words. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } }
    }));
    return response.text || "";
};

export const getConceptConnectionExplanation = async (conceptA: string, conceptB: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Connection: "${conceptA}" and "${conceptB}" in "${caseContext}". 3 sentences. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } }
    }));
    return response.text || "";
};

export const generateDiagramForDiscussion = async (prompt: string, chatContext: string, language: string): Promise<DiagramData> => {
    const ai = getAiClient();
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: `Diagram JSON for: "${prompt}". Context: ${chatContext}. Language: ${language}.`,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: diagramDataSchema,
            thinkingConfig: { thinkingBudget: 0 }
        },
    }));
    const rawData = JSON.parse(response.text || "{}");
    return (rawData as DiagramData) || { nodes: [], links: [] };
};

export const enrichCaseWithWebSources = async (patientCase: PatientCase, language: string): Promise<{ newEvidence: TraceableEvidence[]; newReadings: FurtherReading[]; groundingSources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Find 2 trials and 2 meta-analyses for "${patientCase.title}". Language: ${language}. JSON. **RIGOROUSLY VERIFY ALL PMIDs AND DOIs USING GOOGLE SEARCH TOOL.**`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
    }));
    const text = extractJson(response.text || "{}");
    const parsedData = JSON.parse(text);
    return { 
        newEvidence: parsedData.traceableEvidence || [], 
        newReadings: parsedData.furtherReadings || [], 
        groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] 
    };
};
