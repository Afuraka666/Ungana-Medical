
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink, TraceableEvidence, FurtherReading, DiagramData } from '../types';

const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// FIX: Added and exported EcgFindings interface to resolve import error in EcgInterpreter.tsx.
export interface EcgFindings {
    rate: string;
    rhythm: string;
    pr: string;
    qrs: string;
    qtc: string;
    stSegment: string;
    other: string;
}

// Configuration for Thinking Mode (Gemini 3 Pro)
const THINKING_MODEL = "gemini-3-pro-preview";
const THINKING_CONFIG = {
    thinkingConfig: { thinkingBudget: 32768 }
};

const FAST_MODEL = "gemini-3-flash-preview";

const SYNTHESIS_GUIDELINE = `
**Guideline:** When discussing concepts, equations, graphs, and diagrams, examples from traceable references may be used to enhance clarification. If there is synthesis of any of the above mentioned, the bases (evidence) must be provided and a synthesis label (e.g., "[Synthesis]") must be attached to the synthesised item.

**Molecular Formulas & Clinical Notations:** 
Always use Unicode subscript characters (e.g., ₀, ₁, ₂, ₃, ₄, ₅, ₆, ₇, ₈, ₉) and superscript characters (e.g., ⁰, ¹, ², ³, ⁴, ⁵, ⁶, ⁷, ⁸, ⁹, ⁺, ⁻) for all formulas. 

**Regional Anaesthesia Guideline:**
If a regional block is suggested or mentioned, especially for analgesia, you MUST provide:
1.  **A specific block name** (e.g., ESP block, TAP block, Femoral Nerve Block).
2.  **A specific dose per kg AND total volume dose** of a standard local anaesthetic. **Always include 0.5% Bupivacaine as an alternative if Ropivacaine is mentioned**.
3.  **The type of coverage** provided (explicitly state if it covers **somatosensory**, **visceral**, or **both**).
`;

export const retryWithBackoff = async <T>(
  apiCall: () => Promise<T>,
  maxRetries = 6,
  initialDelay = 3000
): Promise<T> => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await apiCall();
    } catch (error: any) {
      attempt++;
      let searchableString = error?.message || '';
      try {
        const stringified = JSON.stringify(error, Object.getOwnPropertyNames(error));
        if (stringified !== '{}') searchableString += ` ${stringified}`;
      } catch (e) {}

      const errorMessage = searchableString.toLowerCase();
      const isRateLimit = errorMessage.includes("429") || errorMessage.includes("resource_exhausted") || errorMessage.includes("quota exceeded");
      const isServerError = errorMessage.includes("500") || errorMessage.includes("503") || errorMessage.includes("overloaded");
      
      if ((isRateLimit || isServerError) && attempt < maxRetries) {
        const backoffMultiplier = isRateLimit ? 5 : 2;
        const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1) + Math.random() * 5000; 
        console.warn(`Retry ${attempt}/${maxRetries} in ${delay.toFixed(0)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Retry failed.");
};

export const analyzeMedicalDocument = async (imageBase64: string, mimeType: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
        You are an expert clinical clerk. Analyze this image of a medical document (lab report, blood test, clinical notes, or imaging report).
        Extract all relevant clinical information and format it into a clear, structured summary suitable for a medical case study.
        
        **Requirements:**
        1. If it's a blood test: List the parameters, values, units, and highlight any abnormals.
        2. If it's a note: Summarize the findings, diagnosis, or plan.
        3. Format the output in Markdown with clear headings.
        4. Use Unicode for formulas (e.g., CO₂, Na⁺).
        
        Provide the analysis in the following language: ${language}.
    `;

    // FIX: Cast result to GenerateContentResponse to fix 'unknown' type error. Access .text property directly.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: {
            parts: [
                { text: prompt },
                { inlineData: { data: imageBase64, mimeType } }
            ]
        }
    })) as GenerateContentResponse;

    return response.text || "";
};

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
        diagramData: diagramDataSchema
    },
    required: ["type", "title", "description", "reference"]
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
                asaScore: { type: Type.STRING }
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
        biochemicalPathway: educationalContentSchema,
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
                properties: { claim: { type: Type.STRING }, source: { type: Type.STRING } },
                required: ["claim", "source"]
            }
        },
        furtherReadings: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: { topic: { type: Type.STRING }, reference: { type: Type.STRING } },
                required: ["topic", "reference"]
            }
        },
        quiz: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctAnswerIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING }
                },
                required: ["question", "options", "correctAnswerIndex", "explanation"]
            }
        }
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
    const prompt = `Create a realistic medical case for "${condition}" tailored for ${discipline} at ${difficulty} level. Lang: ${language}. ${SYNTHESIS_GUIDELINE}`;
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: { ...THINKING_CONFIG, responseMimeType: "application/json", responseSchema: corePatientCaseSchema }
    })) as GenerateContentResponse;
    return JSON.parse(response.text || "{}");
};

export const generateMainDetails = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const ai = getAiClient();
    const prompt = `Generate pathway and discipline connections for this case: ${coreCase.title}. Lang: ${language}.`;
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: { ...THINKING_CONFIG, responseMimeType: "application/json", responseSchema: mainDetailsSchema }
    })) as GenerateContentResponse;
    return JSON.parse(response.text || "{}");
};

export const generateManagementAndContent = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const ai = getAiClient();
    const prompt = `Generate management considerations and educational content for this case: ${coreCase.title}. Lang: ${language}.`;
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: { ...THINKING_CONFIG, responseMimeType: "application/json", responseSchema: managementAndContentSchema }
    })) as GenerateContentResponse;
    return JSON.parse(response.text || "{}");
};

export const generateEvidenceAndQuiz = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => {
    const ai = getAiClient();
    const prompt = `Generate evidence and quiz for this case: ${coreCase.title}. Lang: ${language}.`;
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: { ...THINKING_CONFIG, responseMimeType: "application/json", responseSchema: evidenceAndQuizSchema }
    })) as GenerateContentResponse;
    return JSON.parse(response.text || "{}");
};

export const generateKnowledgeMap = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string): Promise<KnowledgeMapData> => {
    const ai = getAiClient();
    const prompt = `Generate a knowledge map for this case: ${coreCase.title}. Lang: ${language}.`;
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: { ...THINKING_CONFIG, responseMimeType: "application/json", responseSchema: knowledgeMapSchema }
    })) as GenerateContentResponse;
    return JSON.parse(response.text || "{}");
};

export const enrichCaseWithWebSources = async (patientCase: PatientCase, language: string) => {
    const ai = getAiClient();
    const prompt = `Use search to find evidence for case "${patientCase.title}". Respond in JSON with "traceableEvidence" and "furtherReadings". Lang: ${language}.`;
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
    })) as GenerateContentResponse;
    const text = response.text || "";
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    return jsonMatch ? JSON.parse(jsonMatch[1]) : { traceableEvidence: [], furtherReadings: [] };
};

export const interpretEcg = async (findings: EcgFindings, imageBase64: string | null, imageMimeType: string | null, language: string): Promise<string> => {
    const ai = getAiClient();
    const contentParts: any[] = [{ text: `Interpret this ECG. Lang: ${language}. Findings: ${JSON.stringify(findings)}` }];
    if (imageBase64 && imageMimeType) contentParts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: { parts: contentParts },
        config: THINKING_CONFIG
    })) as GenerateContentResponse;
    return response.text || "";
};

export const generateVisualAid = async (prompt: string): Promise<string> => {
    const ai = getAiClient();
    // FIX: Cast result to GenerateContentResponse and use correct path to inlineData in candidates.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: '4:3' } }
    })) as GenerateContentResponse;
    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
    if (imagePart?.inlineData?.data) return imagePart.inlineData.data;
    throw new Error("No image generated.");
};

export const checkDrugInteractions = async (drugNames: string[], language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Analyze interactions for: ${drugNames.join(', ')}. Lang: ${language}.`;
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({ model: FAST_MODEL, contents: prompt })) as GenerateContentResponse;
    return response.text || "";
};

export const generateSpeech = async (text: string, voiceName: string): Promise<string> => {
    const ai = getAiClient();
    // FIX: Cast result to GenerateContentResponse and access candidate parts for inline audio data.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }
    })) as GenerateContentResponse;
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
};

export const getConceptConnectionExplanation = async (conceptA: string, conceptB: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Explain link between "${conceptA}" and "${conceptB}" in context of "${caseContext}". Lang: ${language}.`;
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({ model: THINKING_MODEL, contents: prompt, config: THINKING_CONFIG })) as GenerateContentResponse;
    return response.text || "";
};

export const generateDiagramForDiscussion = async (prompt: string, chatContext: string, language: string): Promise<DiagramData> => {
    const ai = getAiClient();
    const fullPrompt = `Generate diagram data for "${prompt}". Context: ${chatContext}. Lang: ${language}.`;
    // FIX: Cast result to GenerateContentResponse and use .text property.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: fullPrompt,
        config: { ...THINKING_CONFIG, responseMimeType: "application/json", responseSchema: diagramDataSchema }
    })) as GenerateContentResponse;
    return JSON.parse(response.text || "{}");
};

export const searchForSource = async (query: string, language: string) => {
    const ai = getAiClient();
    // FIX: Cast result to GenerateContentResponse and use .text and grounding chunks from candidates.
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: `Search for source info: ${query}. Lang: ${language}.`,
        config: { tools: [{ googleSearch: {} }] }
    })) as GenerateContentResponse;
    return { summary: response.text, sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] };
};

// FIX: Implemented getConceptAbstract to fix import errors in App.tsx and PatientCaseView.tsx.
export const getConceptAbstract = async (concept: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Provide a concise clinical abstract for the medical concept: "${concept}". Respond in ${language}.`;
    const response = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt
    })) as GenerateContentResponse;
    return response.text || "";
};
