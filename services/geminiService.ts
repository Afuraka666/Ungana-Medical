
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
1. **Clean Formatting (CRITICAL):** Remove all unnecessary symbols, artifacts, or raw technical markers (like stray $ outside of formulas) from visible text. Ensure the narrative is clean, legible, and professional.
2. **Formula Handling:** Use standard scientific notation. Use LaTeX ($...$) ONLY for complex chemical or physiological formulas.
3. **Narrative Integrity:** No citations or PMIDs in 'patientProfile', 'presentingComplaint', or 'history'. These fields must read like a real clinical record.
4. **Real-Time Accuracy:** You MUST use the googleSearch tool to verify the latest 2024-2025 clinical guidelines.
5. **High-Fidelity Tables:** Present all Vitals, Labs, and Medications as clean Markdown Tables.
6. **Visual Triggers (MANDATORY):** Embed exactly one relevant tag per major section where physiological logic applies:
   - \`[GRAPH: oxygen_dissociation]\` (Respiratory/Anemia)
   - \`[GRAPH: frank_starling]\` (Cardiac/Shock/Sepsis)
   - \`[GRAPH: pressure_volume_loop]\` (Hemodynamics/Valve Pathology)
   - \`[GRAPH: cerebral_pressure_volume]\` (Neurotrauma/ICP)
   - \`[GRAPH: cerebral_autoregulation]\` (Neuro/MAP/Stroke)
7. **Quiz Quality:** Generate exactly 5 high-yield clinical MCQs with detailed explanations.
8. **Academic Tone:** Use formal, precise medical terminology.
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

const mainDetailsSchema = {
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
    },
    required: ["biochemicalPathway", "multidisciplinaryConnections"]
};

const managementAndContentSchema = {
    type: Type.OBJECT,
    properties: {
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
    required: ["disciplineSpecificConsiderations"]
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
    const prompt = `Act as a senior medical consultant. Create a high-fidelity professional case for "${condition}". Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}. ${SYNTHESIS_GUIDELINE}`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: corePatientCaseSchema,
            thinkingConfig: { thinkingBudget: 0 },
            tools: [{ googleSearch: {} }]
        },
    }));
    const data = JSON.parse(extractJson(response.text || "{}"));
    return { ...data, groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] } as PatientCase;
};

const generateCasePart = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string, taskDescription: string, responseSchema: any) => {
    const ai = getAiClient();
    const prompt = `For case "${coreCase.title}", generate ${taskDescription}. Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}. ${SYNTHESIS_GUIDELINE}`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { 
            responseMimeType: "application/json", 
            responseSchema: responseSchema,
            thinkingConfig: { thinkingBudget: 0 },
            tools: [{ googleSearch: {} }]
        },
    }));
    const text = extractJson(response.text || "{}");
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return { data: JSON.parse(text), sources };
};

export const generateMainDetails = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const { data, sources } = await generateCasePart(coreCase, discipline, difficulty, language, "biochemicalPathway and multidisciplinaryConnections (MUST embed [GRAPH: tag])", mainDetailsSchema);
    return { ...data, groundingSources: sources };
};

export const generateManagementAndContent = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const { data } = await generateCasePart(coreCase, discipline, difficulty, language, "management considerations (embed [GRAPH: tag])", managementAndContentSchema);
    return data;
};

export const generateEvidenceAndQuiz = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const { data } = await generateCasePart(coreCase, discipline, difficulty, language, "traceable evidence and exactly 5 quiz questions", evidenceAndQuizSchema);
    return data;
};

export const generateKnowledgeMap = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string): Promise<KnowledgeMapData> => {
    const { data } = await generateCasePart(coreCase, discipline, difficulty, language, "a knowledge map with 10 nodes", knowledgeMapSchema);
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
    const prompt = `Find 2 trials and 2 meta-analyses for "${patientCase.title}". Language: ${language}. JSON.`;
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
