
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

const THINKING_MODEL = "gemini-3-pro-preview"; // Reserved for complex tutoring/reasoning
const THINKING_CONFIG = {};
const FAST_MODEL = "gemini-3-flash-preview"; // Used for core generation to ensure sub-20s speed

const SYNTHESIS_GUIDELINE = `
**Guideline:** Provide exhaustive technical detail. Use Unicode subscripts (₀₁₂₃₄₅₆₇₈₉) and superscripts (⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻). 

**Regional Anaesthesia:**
For any block, you MUST provide:
1. **Name:** e.g., Adductor Canal Block.
2. **Pharmacology:** Exact dose in mg/kg.
3. **Volume:** Total volume in mL/kg.
4. **Coverage:** Somatosensory, Visceral, or Both.

**High Fidelity Visuals:**
- Use Markdown Tables for physiological values (e.g., Vitals, Lab results).
- Ensure 'Multidisciplinary Connections' and 'Management' are distinct with no overlap.
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
        history: { type: Type.STRING },
        procedureDetails: {
            type: Type.OBJECT,
            properties: {
                procedureName: { type: Type.STRING },
                asaScore: { type: Type.STRING, enum: ['1', '2', '3', '4', '5', '6', '1E', '2E', '3E', '4E', '5E', '6E'] }
            },
            required: ["procedureName", "asaScore"],
            nullable: true
        }
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
        },
        educationalContent: { type: Type.ARRAY, items: educationalContentSchema }
    },
    required: ["disciplineSpecificConsiderations", "educationalContent"]
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

export const getConceptAbstract = async (concept: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Context: "${caseContext}". Significance of: "${concept}". 50 words. Use Unicode. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: { ...THINKING_CONFIG },
    }));
    return response.text || "";
};

export const generateCorePatientCase = async (condition: string, discipline: string, difficulty: string, language: string): Promise<PatientCase> => {
    const ai = getAiClient();
    const prompt = `Generate a patient case for "${condition}". Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}. ${SYNTHESIS_GUIDELINE} Return JSON.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL, // FAST_MODEL for speed
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: corePatientCaseSchema },
    }));
    return JSON.parse(response.text || "{}") as PatientCase;
};

const generateCasePart = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string, taskDescription: string, responseSchema: any) => {
    const ai = getAiClient();
    const prompt = `For patient case "${coreCase.title}", generate ${taskDescription}. Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}. ${SYNTHESIS_GUIDELINE} Return JSON.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL, // FAST_MODEL for speed
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: responseSchema },
    }));
    return JSON.parse(response.text || "{}");
};

export const generateMainDetails = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "biochemicalPathway and 5 multidisciplinaryConnections", mainDetailsSchema);

export const generateManagementAndContent = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "management considerations and educational content", managementAndContentSchema);

export const generateEvidenceAndQuiz = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "traceableEvidence, furtherReadings, and quiz questions", evidenceAndQuizSchema);

export const generateKnowledgeMap = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string): Promise<KnowledgeMapData> => {
    const rawMapData = await generateCasePart(coreCase, discipline, difficulty, language, "a knowledge map with 8 nodes", knowledgeMapSchema);
    const validNodeIds = new Set(rawMapData.nodes.map((n: KnowledgeNode) => n.id));
    const validLinks = rawMapData.links.filter((l: KnowledgeLink) => validNodeIds.has(l.source) && validNodeIds.has(l.target));
    return { nodes: rawMapData.nodes, links: validLinks };
};

export const searchForSource = async (sourceQuery: string, language: string): Promise<{ summary: string; sources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Research assistant: Find info about "${sourceQuery}". Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.1 },
    }));
    return { summary: response.text || "", sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] };
};

export const interpretEcg = async (findings: EcgFindings, imageBase64: string | null, imageMimeType: string | null, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Interpret ECG. Findings: ${JSON.stringify(findings)}. Language: ${language}. Use Markdown tables for intervals.`;
    const contentParts: any[] = [{ text: prompt }];
    if (imageBase64 && imageMimeType) contentParts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: { parts: contentParts }
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
    if (!data) throw new Error("No image generated.");
    return data;
};

export const checkDrugInteractions = async (drugNames: string[], language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Analyze interactions: ${drugNames.join(', ')}. Language: ${language}. Use Markdown Tables.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt
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
    if (!data) throw new Error("No audio data.");
    return data;
};

export const getConceptConnectionExplanation = async (conceptA: string, conceptB: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Connection: "${conceptA}" and "${conceptB}" in "${caseContext}". 3 sentences. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt
    }));
    return response.text || "";
};

export const generateDiagramForDiscussion = async (prompt: string, chatContext: string, language: string): Promise<DiagramData> => {
    const ai = getAiClient();
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: `Diagram data for: "${prompt}". Context: ${chatContext}. Language: ${language}. JSON.`,
        config: { responseMimeType: "application/json", responseSchema: diagramDataSchema },
    }));
    return JSON.parse(response.text || "{}") as DiagramData;
};
export const enrichCaseWithWebSources = async (patientCase: PatientCase, language: string): Promise<{ newEvidence: TraceableEvidence[]; newReadings: FurtherReading[]; groundingSources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Regarding "${patientCase.title}", find recent medical updates. Provide 2 Traceable Evidence and 2 Further Reading suggestions (PMIDs/DOIs). Language: ${language}. Format: JSON in markdown code block.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
    }));
    const jsonMatch = (response.text || "").match(/```json\n([\s\S]*?)\n```/);
    const parsedData = jsonMatch ? JSON.parse(jsonMatch[1]) : {};
    return { 
        newEvidence: parsedData.traceableEvidence || [], 
        newReadings: parsedData.furtherReadings || [], 
        groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] 
    };
};
