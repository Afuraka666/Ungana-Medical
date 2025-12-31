
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

const THINKING_MODEL = "gemini-3-pro-preview"; 
const FAST_MODEL = "gemini-3-flash-preview"; 

const SYNTHESIS_GUIDELINE = `
**CRITICAL CLINICAL FIDELITY & FORMATTING RULES:**
1. **Narrative Integrity (STRICT):** You MUST NOT include citations, PMIDs, or external links in 'patientProfile', 'presentingComplaint', or 'history'. These are strictly narrative.
2. **High-Fidelity Markdown Tables (STRICT MANDATE):** You MUST render ALL Vital Signs, Lab Results, and Medications as properly formatted Markdown Tables. NEVER use lists or plain text for this structured data.
   - **Vital Signs Table Requirement:**
     | Parameter | Value |
     | :--- | :--- |
     | BP | 148/96 mmHg |
     | HR | 92 bpm |
   - **Lab Panel Requirement:**
     | Analyte | Result | Reference |
     | :--- | :--- | :--- |
     | Troponin T | 0.85 ng/mL | <0.01 |
   - **Medications Requirement:**
     | Medication | Dose | Frequency |
     | :--- | :--- | :--- |
     | Aspirin | 300mg | Stat |
3. **Rigorous Technical Evidence:** Every clinical claim in 'multidisciplinaryConnections', 'traceableEvidence', and 'furtherReadings' MUST be supported by technical research with accurate PMIDs. Use only clinical/medical sources.
4. **Visual Triggers:** Strategically embed: \`[GRAPH: oxygen_dissociation]\`, \`[DIAGRAM: description]\`, or \`[ILLUSTRATE: description]\`.
5. **Map Disciplines:** Only use these exact labels: Biochemistry, Pharmacology, Physiology, Psychology, Sociology, Pathology, Immunology, Genetics, Diagnostics, Treatment, Physiotherapy, Occupational Therapy, Anaesthesia, Pain Management, Nursing, Nutrition & Dietetics, Social Work, Speech & Language Therapy.
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

export const generateCorePatientCase = async (condition: string, discipline: string, difficulty: string, language: string): Promise<PatientCase> => {
    const ai = getAiClient();
    const prompt = `Act as a senior medical consultant. Create a high-fidelity multidisciplinary patient case for "${condition}". Student Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}. ${SYNTHESIS_GUIDELINE} Return JSON.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: corePatientCaseSchema },
    }));
    return JSON.parse(response.text || "{}") as PatientCase;
};

const generateCasePart = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string, taskDescription: string, responseSchema: any) => {
    const ai = getAiClient();
    const prompt = `For the case "${coreCase.title}", generate ${taskDescription}. Student Discipline: ${discipline}. Difficulty: ${difficulty}. Language: ${language}. ${SYNTHESIS_GUIDELINE} Return JSON.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: responseSchema },
    }));
    return JSON.parse(response.text || "{}");
};

export const generateMainDetails = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "biochemicalPathway and exhaustive multidisciplinaryConnections with academic citations", mainDetailsSchema);

export const generateManagementAndContent = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "evidence-based management considerations and high-fidelity visuals", managementAndContentSchema);

export const generateEvidenceAndQuiz = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "traceableEvidence citing recent robust trials/meta-analyses, furtherReadings (PMIDs), and exactly 5 quiz questions", evidenceAndQuizSchema);

export const generateKnowledgeMap = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string): Promise<KnowledgeMapData> => {
    const rawMapData = await generateCasePart(coreCase, discipline, difficulty, language, "a knowledge map with 8 nodes and high-fidelity connections", knowledgeMapSchema);
    const validNodeIds = new Set(rawMapData.nodes.map((n: KnowledgeNode) => n.id));
    const validLinks = rawMapData.links.filter((l: KnowledgeLink) => validNodeIds.has(l.source) && validNodeIds.has(l.target));
    return { nodes: rawMapData.nodes, links: validLinks };
};

export const searchForSource = async (sourceQuery: string, language: string): Promise<{ summary: string; sources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Verified Medical Research for "${sourceQuery}". Find the latest robust RCTs, meta-analyses and systematic reviews. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.1 },
    }));
    return { summary: response.text || "", sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] };
};

export const interpretEcg = async (findings: EcgFindings, imageBase64: string | null, imageMimeType: string | null, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `ECG Interpretation Report. Findings: ${JSON.stringify(findings)}. Language: ${language}. Use high-fidelity Markdown tables for all intervals and interpret based on current clinical guidelines.`;
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
    if (!data) throw new Error("Visual aid generation failed.");
    return data;
};

export const checkDrugInteractions = async (drugNames: string[], language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Analyze technical drug interactions for: ${drugNames.join(', ')}. Language: ${language}. Return a professional Markdown Table comparing mechanism, severity, and recommendation.`;
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
    if (!data) throw new Error("Speech synthesis failed.");
    return data;
};

export const getConceptAbstract = async (concept: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Medical Significance: Explain "${concept}" relevance to "${caseContext}". 50 words max. Technical tone. Language: ${language}.`;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
    }));
    return response.text || "";
};

export const getConceptConnectionExplanation = async (conceptA: string, conceptB: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Technical pathophysiology connection between "${conceptA}" and "${conceptB}" in "${caseContext}". 3 technical sentences. Language: ${language}.`;
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
        contents: `Generate Diagram JSON for: "${prompt}". Context: ${chatContext}. Language: ${language}. Ensure strictly valid JSON.`,
        config: { responseMimeType: "application/json", responseSchema: diagramDataSchema },
    }));
    return JSON.parse(response.text || "{}") as DiagramData;
};

export const enrichCaseWithWebSources = async (patientCase: PatientCase, language: string): Promise<{ newEvidence: TraceableEvidence[]; newReadings: FurtherReading[]; groundingSources: any[] }> => {
    const ai = getAiClient();
    const prompt = `Find 2 recent robust technical clinical claims with PMIDs and 2 meta-analyses for "${patientCase.title}". Language: ${language}. Format as JSON.`;
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
