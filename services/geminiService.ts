
import { GoogleGenAI, Type, GenerateContentResponse, Modality, GenerateImagesResponse } from "@google/genai";
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink, TraceableEvidence, FurtherReading, DiagramData } from '../types';

const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// FIX: Added retryWithBackoff function to handle API retries and export it for use in other components.
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
            // Only retry on 429 (Rate Limit) or 5xx (Server Error)
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

// Configuration for Thinking Mode (Gemini 3 Pro)
const THINKING_MODEL = "gemini-3-pro-preview";
const THINKING_CONFIG = {};
const FAST_MODEL = "gemini-3-flash-preview";

const SYNTHESIS_GUIDELINE = `
**Guideline:** When discussing concepts, equations, graphs, and diagrams, examples from traceable references may be used to enhance clarification. If there is synthesis of any of the above mentioned, the bases (evidence) must be provided and a synthesis label (e.g., "[Synthesis]") must be attached to the synthesised item.

**Molecular Formulas & Clinical Notations:** 
Always use Unicode subscript characters (e.g., ₀, ₁, ₂, ₃, ₄, ₅, ₆, ₇, ₈, ₉) and superscript characters (e.g., ⁰, ¹, ², ³, ⁴, ⁵, ⁶, ⁷, ⁸, ⁹, ⁺, ⁻) for all formulas. 
- Examples: CO₂, SpO₂, SaO₂, H₂O, C₆H₁₂O₆, Na⁺, Cl⁻, Ca²⁺, HCO₃⁻, PO₄³⁻. 

**Regional Anaesthesia & Clinical Procedures:**
If a regional block is suggested (e.g., in Anaesthesia, Treatment, or Pain Management sections), you MUST be exhaustive:
1.  **Specific Block Name:** (e.g., Interscalene Brachial Plexus Block, Adductor Canal Block, Popliteal Sciatic Block).
2.  **Pharmacology:** Specific dose in mg/kg.
3.  **Volume:** Total volume dose in mL/kg.
4.  **Alternatives:** Always provide 0.5% Bupivacaine as an alternative if another local anaesthetic is used (e.g., "0.5% Bupivacaine at 2mg/kg (0.4mL/kg)").
5.  **Coverage Type:** Explicitly state if it provides **somatosensory**, **visceral**, or **both** coverage.
`;

const diagramNodeSchema = {
    type: Type.OBJECT,
    properties: {
        id: { type: Type.STRING, description: "A unique, concise identifier for the node." },
        label: { type: Type.STRING, description: "A short, human-readable label." },
        description: { type: Type.STRING, description: "Brief explanation of the node's role." },
    },
    required: ["id", "label"]
};

const diagramLinkSchema = {
    type: Type.OBJECT,
    properties: {
        source: { type: Type.STRING, description: "The 'id' of the source node." },
        target: { type: Type.STRING, description: "The 'id' of the target node." },
        label: { type: Type.STRING, description: "Label for the relationship." }
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
        },
        outcomes: {
            type: Type.OBJECT,
            properties: {
                icuAdmission: { type: Type.BOOLEAN },
                lengthOfStayDays: { type: Type.INTEGER },
                outcomeSummary: { type: Type.STRING }
            },
            required: ["icuAdmission", "lengthOfStayDays", "outcomeSummary"],
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
          description: "An array of 5-7 distinct medical discipline connections.",
          items: {
            type: Type.OBJECT,
            properties: {
              discipline: {
                type: Type.STRING,
                enum: ["Biochemistry", "Pharmacology", "Physiology", "Psychology", "Sociology", "Pathology", "ImmunoLogy", "Genetics", "Diagnostics", "Treatment", "Physiotherapy", "Occupational Therapy", "Anaesthesia", "Pain Management"]
              },
              connection: { type: Type.STRING, description: "Detailed clinical link. Include regional block specifics if applicable (Name, mg/kg, mL/kg, alternatives, somatosensory/visceral coverage)." },
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
                    discipline: { 
                        type: Type.STRING,
                        enum: ["Biochemistry", "Pharmacology", "Physiology", "Psychology", "Sociology", "Pathology", "ImmunoLogy", "Genetics", "Diagnostics", "Treatment", "Physiotherapy", "Occupational Therapy", "Anaesthesia", "Pain Management"]
                    },
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
    const prompt = `
        In the context of a patient with "${caseContext}", provide a concise, one-paragraph abstract (around 50-70 words) explaining the significance of "${concept}".
        
        ${SYNTHESIS_GUIDELINE}

        Please provide the response in the following language: ${language}.
    `;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: { ...THINKING_CONFIG },
    }));
    return response.text || "";
};

const getDifficultyInstructions = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
        case 'beginner':
            return `**Difficulty Level: Beginner** Focus on 2-3 core, high-yield multidisciplinary connections.`;
        case 'advanced':
            return `**Difficulty Level: Advanced** Highly complex, 3-4 differential diagnoses, 5-7 deep multidisciplinary connections including ethical and public health dimensions.`;
        case 'intermediate':
        default:
            return `**Difficulty Level: Intermediate** 3-5 relevant multidisciplinary connections.`;
    }
};

export const generateCorePatientCase = async (condition: string, discipline: string, difficulty: string, language: string): Promise<PatientCase> => {
    const ai = getAiClient();
    const difficultyInstructions = getDifficultyInstructions(difficulty);
    const prompt = `
        Create the core narrative for a multidisciplinary medical case about "${condition}".
        Language: ${language}. Student Discipline: ${discipline}.
        ${difficultyInstructions}
        ${SYNTHESIS_GUIDELINE}
        Generate ONLY: title, patientProfile, presentingComplaint, history, procedureDetails, outcomes.
    `;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: {
            ...THINKING_CONFIG,
            responseMimeType: "application/json",
            responseSchema: corePatientCaseSchema,
        },
    }));
    return JSON.parse(response.text || "{}") as PatientCase;
};

const generateCasePart = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string, taskDescription: string, responseSchema: any) => {
    const ai = getAiClient();
    const difficultyInstructions = getDifficultyInstructions(difficulty);
    const coreCaseContext = `**Patient Case Context:** - Title: ${coreCase.title} - History: ${coreCase.history}`;
    const prompt = `
        Generate requested sections based on context.
        Language: ${language}. Student Discipline: ${discipline}.
        ${coreCaseContext}
        ${difficultyInstructions}
        ${SYNTHESIS_GUIDELINE}
        Your task is to generate ONLY: ${taskDescription}
    `;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: {
            ...THINKING_CONFIG,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
        },
    }));
    return JSON.parse(response.text || "{}");
};

export const generateMainDetails = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "biochemicalPathway, multidisciplinaryConnections (5-7 items, high detail)", mainDetailsSchema);

export const generateManagementAndContent = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "disciplineSpecificConsiderations, educationalContent", managementAndContentSchema);

export const generateEvidenceAndQuiz = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "traceableEvidence, furtherReadings, quiz", evidenceAndQuizSchema);

export const generateKnowledgeMap = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string): Promise<KnowledgeMapData> => {
    const rawMapData = await generateCasePart(coreCase, discipline, difficulty, language, "A knowledge map with 8-12 nodes.", knowledgeMapSchema);
    const validNodeIds = new Set(rawMapData.nodes.map((n: KnowledgeNode) => n.id));
    const validLinks = rawMapData.links.filter((l: KnowledgeLink) => validNodeIds.has(l.source) && validNodeIds.has(l.target));
    return { nodes: rawMapData.nodes, links: validLinks };
};

export const enrichCaseWithWebSources = async (patientCase: PatientCase, language: string): Promise<{ newEvidence: TraceableEvidence[]; newReadings: FurtherReading[]; groundingSources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Regarding "${patientCase.title}", find most recent medical information. Provide 2 Traceable Evidence and 2 Further Reading suggestions with PMIDs/DOIs. Format response as JSON in markdown code block. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
    }));
    const text = response.text || "";
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    const parsedData = jsonMatch ? JSON.parse(jsonMatch[1]) : {};
    return { 
        newEvidence: parsedData.traceableEvidence || [], 
        newReadings: parsedData.furtherReadings || [], 
        groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] 
    };
};

export const searchForSource = async (sourceQuery: string, language: string): Promise<{ summary: string; sources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Act as research assistant. Use Google Search to find info about: "${sourceQuery}". Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.1 },
    }));
    return { 
        summary: response.text || "", 
        sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] 
    };
};

export interface EcgFindings {
    rate?: string;
    rhythm?: string;
    pr?: string;
    qrs?: string;
    qtc?: string;
    stSegment?: string;
    other?: string;
}

export const interpretEcg = async (findings: EcgFindings, imageBase64: string | null, imageMimeType: string | null, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = ` Cardiology report request. Language: ${language}. Findings: Rate ${findings.rate}, Rhythm ${findings.rhythm}, PR ${findings.pr}, QRS ${findings.qrs}, QTc ${findings.qtc}, ST ${findings.stSegment}. Other: ${findings.other}`;
    const contentParts: any[] = [{ text: prompt }];
    if (imageBase64 && imageMimeType) {
        contentParts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
    }
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: { parts: contentParts },
        config: { ...THINKING_CONFIG }
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
    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
    if (!imagePart?.inlineData?.data) throw new Error("No image generated.");
    return imagePart.inlineData.data;
};

export const checkDrugInteractions = async (drugNames: string[], language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Analyze drugs for interactions: ${drugNames.join(', ')}. Language: ${language}. Use Markdown.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { temperature: 0.2 },
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
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data.");
    return base64Audio;
};

export const getConceptConnectionExplanation = async (conceptA: string, conceptB: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Pathophysiological connection between "${conceptA}" and "${conceptB}" for context: "${caseContext}". Concise, 2-3 sentences. Language: ${language}. ${SYNTHESIS_GUIDELINE}`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: { ...THINKING_CONFIG },
    }));
    return response.text || "";
};

export const generateDiagramForDiscussion = async (prompt: string, chatContext: string, language: string): Promise<DiagramData> => {
    const ai = getAiClient();
    const fullPrompt = `Generate diagram data for: "${prompt}". Context: ${chatContext}. Language: ${language}. JSON format only.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: fullPrompt,
        config: {
            ...THINKING_CONFIG,
            responseMimeType: "application/json",
            responseSchema: diagramDataSchema,
        },
    }));
    return JSON.parse(response.text || "{}") as DiagramData;
};
