
import { GoogleGenAI, Type, GenerateContentResponse, Modality, GenerateImagesResponse } from "@google/genai";
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink, TraceableEvidence, FurtherReading, DiagramData } from '../types';

const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Configuration for Thinking Mode (Gemini 3 Pro)
// Used for complex reasoning tasks like case generation, pathophysiology explanation, and diagram logic.
const THINKING_MODEL = "gemini-3-pro-preview";
const THINKING_CONFIG = {
    thinkingConfig: { thinkingBudget: 32768 } // Max budget for deep reasoning
};

// Configuration for Fast/Utility tasks
const FAST_MODEL = "gemini-2.5-flash";

const SYNTHESIS_GUIDELINE = `
**Guideline:** When discussing concepts, equations, graphs, and diagrams, examples from traceable references may be used to enhance clarification. If there is synthesis of any of the above mentioned, the bases (evidence) must be provided and a synthesis label (e.g., "[Synthesis]") must be attached to the synthesised item.

**Molecular Formulas & Clinical Notations:** 
Always use Unicode subscript characters (e.g., ₀, ₁, ₂, ₃, ₄, ₅, ₆, ₇, ₈, ₉) and superscript characters (e.g., ⁰, ¹, ², ³, ⁴, ⁵, ⁶, ⁷, ⁸, ⁹, ⁺, ⁻) for all formulas. 
- Examples: CO₂, SpO₂, SaO₂, H₂O, C₆H₁₂O₆, Na⁺, Cl⁻, Ca²⁺, HCO₃⁻, PO₄³⁻. 
- **CRITICAL:** DO NOT use LaTeX symbols ($), math mode, or markdown bolding for chemical/molecular/clinical formulas. Use plain text with Unicode subscripts/superscripts only.

**Regional Anaesthesia Guideline:**
If a regional block is suggested or mentioned, especially for analgesia, you MUST provide:
1.  **A specific block name** (e.g., ESP block, TAP block, Femoral Nerve Block).
2.  **A specific dose per kg AND total volume dose** of a standard local anaesthetic (e.g., "0.25% Bupivacaine at 2mg/kg (approx. 0.8mL/kg)").
3.  **The type of coverage** provided (explicitly state if it covers **somatosensory**, **visceral**, or **both**).
`;

/**
 * A utility function to retry an API call with exponential backoff.
 * This is useful for handling transient errors like 503 "model overloaded" or 429 "quota exceeded".
 * @param apiCall The async function to call.
 * @param maxRetries The maximum number of retries.
 * @param initialDelay The initial delay in milliseconds.
 * @returns The result of the API call.
 */
export const retryWithBackoff = async <T>(
  apiCall: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 2000 // Increased initial delay for better quota safety
): Promise<T> => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await apiCall();
    } catch (error: any) {
      attempt++;
      
      // Create a searchable string from the error.
      let searchableString = error?.message || '';
      try {
        const stringified = JSON.stringify(error, Object.getOwnPropertyNames(error));
        if (stringified !== '{}') {
          searchableString += ` ${stringified}`;
        }
      } catch (e) {
        if (!searchableString) searchableString = String(error);
      }

      const errorMessage = searchableString.toLowerCase();
      
      // Determine if the error is retryable.
      // 429: Resource Exhausted (Quota), 500: Internal, 503: Service Unavailable/Overloaded
      const isRateLimit = errorMessage.includes("429") || errorMessage.includes("resource_exhausted") || errorMessage.includes("quota exceeded");
      const isServerError = errorMessage.includes("500") || errorMessage.includes("internal server error") || errorMessage.includes("503") || errorMessage.includes("overloaded") || errorMessage.includes("unavailable");
      
      const isRetryable = isRateLimit || isServerError;
      
      if (isRetryable && attempt < maxRetries) {
        // For rate limits (429), use a significantly longer backoff to allow quota to reset.
        const backoffMultiplier = isRateLimit ? 4 : 2;
        const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1) + Math.random() * 3000; 
        
        console.warn(`API call failed with ${isRateLimit ? 'Rate Limit (429)' : 'Server Error'}. Attempt ${attempt}/${maxRetries}. Retrying in ${delay.toFixed(0)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Retry logic failed unexpectedly.");
};

const diagramNodeSchema = {
    type: Type.OBJECT,
    properties: {
        id: { type: Type.STRING, description: "A unique, concise identifier for the node (e.g., 'glucose')." },
        label: { type: Type.STRING, description: "A short, human-readable label for the node (e.g., 'Glucose')." },
        description: { type: Type.STRING, description: "An optional brief explanation of the node's role in the diagram." },
    },
    required: ["id", "label"]
};

const diagramLinkSchema = {
    type: Type.OBJECT,
    properties: {
        source: { type: Type.STRING, description: "The 'id' of the source node." },
        target: { type: Type.STRING, description: "The 'id' of the target node." },
        label: { type: Type.STRING, description: "A brief label for the relationship (e.g., 'is converted to', 'inhibits')." }
    },
    required: ["source", "target", "label"]
};

const diagramDataSchema = {
    type: Type.OBJECT,
    properties: {
        nodes: {
            type: Type.ARRAY,
            description: "An array of concepts or components in the diagram.",
            items: diagramNodeSchema
        },
        links: {
            type: Type.ARRAY,
            description: "An array of relationships connecting the nodes.",
            items: diagramLinkSchema
        }
    },
    required: ["nodes", "links"],
    nullable: true
};

const educationalContentSchema = {
    type: Type.OBJECT,
    properties: {
        type: {
            type: Type.STRING,
            description: "The type of educational content.",
            enum: ["Diagram", "Graph", "Formula", "Image"]
        },
        title: { type: Type.STRING, description: "A concise title for the content." },
        description: { type: Type.STRING, description: "A detailed text description of the visual content. This should summarize the diagram's purpose and key takeaways." },
        reference: { type: Type.STRING, description: "The source or citation for the content." },
        diagramData: {
            ...diagramDataSchema,
            description: "If the type is 'Diagram', provide the structured data for nodes and links to build an interactive diagram. For other types, this should be null."
        }
    },
    required: ["type", "title", "description", "reference"]
};

const quizQuestionSchema = {
    type: Type.OBJECT,
    properties: {
        question: { type: Type.STRING, description: "The quiz question text." },
        options: {
            type: Type.ARRAY,
            description: "An array of 4 possible answers (strings).",
            items: { type: Type.STRING }
        },
        correctAnswerIndex: { type: Type.INTEGER, description: "The 0-based index of the correct answer in the 'options' array." },
        explanation: { type: Type.STRING, description: "A brief explanation of why the correct answer is right." }
    },
    required: ["question", "options", "correctAnswerIndex", "explanation"]
};

const corePatientCaseSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A concise title for the patient case, e.g., 'Type 2 Diabetes Mellitus with Complicating Social Factors'." },
        patientProfile: { type: Type.STRING, description: "A brief profile of the patient including age, gender, and occupation." },
        presentingComplaint: { type: Type.STRING, description: "The main reason for seeking medical attention." },
        history: { type: Type.STRING, description: "A detailed history of the present illness, past medical history, social history, and family history. This should be a comprehensive narrative." },
        procedureDetails: {
            type: Type.OBJECT,
            description: "Details about the primary procedure performed and the patient's ASA physical status classification.",
            properties: {
                procedureName: { type: Type.STRING, description: "The name of the medical or surgical procedure." },
                asaScore: { 
                    type: Type.STRING, 
                    description: "The ASA score, from '1' to '6', with an optional 'E' for emergency cases (e.g., '2', '3E').",
                    enum: ['1', '2', '3', '4', '5', '6', '1E', '2E', '3E', '4E', '5E', '6E']
                }
            },
            required: ["procedureName", "asaScore"],
            nullable: true
        },
        outcomes: {
            type: Type.OBJECT,
            description: "The eventual outcomes for the patient following the conclusion of the case.",
            properties: {
                icuAdmission: { type: Type.BOOLEAN, description: "Whether the patient required ICU admission." },
                lengthOfStayDays: { type: Type.INTEGER, description: "The total length of hospital stay in days." },
                outcomeSummary: { type: Type.STRING, description: "A brief summary of the patient's final outcome (e.g., 'Discharged home with full recovery')." }
            },
            required: ["icuAdmission", "lengthOfStayDays", "outcomeSummary"],
            nullable: true
        }
    },
    required: ["title", "patientProfile", "presentingComplaint", "history"]
};

// --- START: Schemas for Parallel Generation ---

const mainDetailsSchema = {
    type: Type.OBJECT,
    properties: {
        biochemicalPathway: {
            ...educationalContentSchema,
            description: "A detailed educational section focusing on a single, core biochemical pathway or physiological mechanism directly relevant to the patient's primary condition. This must include a title, a detailed description, a reference, and where applicable, structured diagramData for visualization."
        },
        multidisciplinaryConnections: {
          type: Type.ARRAY,
          description: "An array of connections between the patient's condition and various medical disciplines.",
          items: {
            type: Type.OBJECT,
            properties: {
              discipline: {
                type: Type.STRING,
                description: "The medical discipline (e.g., Pharmacology, Psychology, Sociology).",
                enum: ["Biochemistry", "Pharmacology", "Physiology", "Psychology", "Sociology", "Pathology", "Immunology", "Genetics", "Diagnostics", "Treatment", "Physiotherapy", "Occupational Therapy"]
              },
              connection: { type: Type.STRING, description: "A detailed explanation of how this discipline connects to the patient's case. If regional blocks are mentioned, include block name, dose per kg, volume dose, and somatosensory/visceral coverage." },
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
            description: "An array of management considerations tailored to a specific medical discipline.",
            items: {
              type: Type.OBJECT,
              properties: {
                aspect: { type: Type.STRING, description: "The specific aspect of care (e.g., 'Diagnostic Imaging', 'Post-operative Care', 'Patient Education')." },
                consideration: { type: Type.STRING, description: "The detailed consideration or action plan for this aspect from the specified discipline's viewpoint. If regional blocks are mentioned, include block name, dose per kg, volume dose, and somatosensory/visceral coverage." }
              },
              required: ["aspect", "consideration"]
            }
        },
        educationalContent: {
            type: Type.ARRAY,
            description: "An array of 1-2 pieces of rich educational content like diagrams or formulas relevant to the case.",
            items: educationalContentSchema
        }
    },
    required: ["disciplineSpecificConsiderations", "educationalContent"]
};

const evidenceAndQuizSchema = {
    type: Type.OBJECT,
    properties: {
        traceableEvidence: {
            type: Type.ARRAY,
            description: "An array of 3-4 key claims made in the case study backed by specific, citable evidence or sources.",
            items: {
                type: Type.OBJECT,
                properties: {
                    claim: { type: Type.STRING, description: "The clinical statement or claim being supported." },
                    source: { type: Type.STRING, description: "The reference or source for the evidence (e.g., '(Systematic Review) JAMA 2023;329(1):7-8' or '(Clinical Guideline) UpToDate on COPD')." }
                },
                required: ["claim", "source"]
            }
        },
        furtherReadings: {
            type: Type.ARRAY,
            description: "An array of suggested readings or references for the student to learn more about the topics discussed.",
            items: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING, description: "The topic of the suggested reading." },
                    reference: { type: Type.STRING, description: "The full citation or link to the suggested reading material." }
                },
                required: ["topic", "reference"]
            }
        },
        quiz: {
            type: Type.ARRAY,
            description: "A multiple-choice quiz with 5 questions to test understanding of the case.",
            items: quizQuestionSchema
        }
    },
    required: ["traceableEvidence", "furtherReadings", "quiz"]
};

const knowledgeMapSchema = {
    type: Type.OBJECT,
    properties: {
        nodes: {
            type: Type.ARRAY,
            description: "An array of 8-12 core concepts or entities from the patient case.",
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: "A unique, concise identifier for the node (e.g., 'type_2_diabetes')." },
                    label: { type: Type.STRING, description: "A short, human-readable label for the node (e.g., 'Type 2 Diabetes')." },
                    discipline: { 
                        type: Type.STRING, 
                        description: "The primary medical discipline this concept belongs to.",
                        enum: ["Biochemistry", "Pharmacology", "Physiology", "Psychology", "Sociology", "Pathology", "Immunology", "Genetics", "Diagnostics", "Treatment", "Physiotherapy", "Occupational Therapy"]
                    },
                    summary: { type: Type.STRING, description: "A concise, one-paragraph abstract (50-70 words) explaining the node's significance in the context of the case. If regional blocks are mentioned, include block name, dose per kg, volume dose, and somatosensory/visceral coverage." }
                },
                required: ["id", "label", "discipline", "summary"]
            }
        },
        links: {
            type: Type.ARRAY,
            description: "An array of relationships connecting the nodes.",
            items: {
                type: Type.OBJECT,
                properties: {
                    source: { type: Type.STRING, description: "The 'id' of the source node for the connection." },
                    target: { type: Type.STRING, description: "The 'id' of the target node for the connection." },
                    description: { type: Type.STRING, description: "A brief description of the relationship (e.g., 'exacerbates', 'causes', 'treats')." }
                },
                required: ["source", "target", "description"]
            }
        }
    },
    required: ["nodes", "links"]
};

// --- END: Schemas for Parallel Generation ---


export const getConceptAbstract = async (concept: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
        In the context of a patient with "${caseContext}", provide a concise, one-paragraph abstract (around 50-70 words) explaining the significance of "${concept}".
        The explanation should be stimulating for a medical student, highlighting its importance and encouraging further exploration of its connections.
        
        ${SYNTHESIS_GUIDELINE}

        Please provide the response in the following language: ${language}.
    `;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: {
            ...THINKING_CONFIG,
        },
    }));
    return response.text;
};

const getDifficultyInstructions = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
        case 'beginner':
            return `
                **Difficulty Level: Beginner**
                - The case history should be straightforward with a clear, classic presentation of the condition.
                - Limit comorbidities to one, if any. The narrative should be easy to follow.
                - Focus on 2-3 core, high-yield multidisciplinary connections.
                - The quiz questions should be direct recall questions based on the text.
            `;
        case 'advanced':
            return `
                **Difficulty Level: Advanced**
                - The case must be highly complex, potentially with a rare presentation or multiple significant comorbidities that interact.
                - **Crucially, the narrative must include subtle diagnostic clues, atypical findings, and potential "red herring" details.** These elements should be carefully crafted to make the diagnostic process challenging and require careful clinical reasoning.
                - **The case must support a differential diagnosis of at least 3-4 plausible conditions.** The history and findings should contain specific, subtle information that helps distinguish the final diagnosis from these alternatives.
                - Explore at least 5-6 deep multidisciplinary connections, including less obvious psychosocial, ethical, or public health dimensions.
                - The quiz questions must be challenging, requiring synthesis of multiple concepts, evaluation of management options, and **explicitly addressing the differential diagnoses presented in the case.**
            `;
        case 'intermediate':
        default:
            return `
                **Difficulty Level: Intermediate**
                - The case should have moderate complexity, with one or two confounding factors or comorbidities.
                - Involve 3-5 clear and relevant multidisciplinary connections.
                - The quiz questions should test comprehension and application of the case details, requiring some synthesis of information.
            `;
    }
};

export const generateCorePatientCase = async (condition: string, discipline: string, difficulty: string, language: string): Promise<PatientCase> => {
    const ai = getAiClient();
    const difficultyInstructions = getDifficultyInstructions(difficulty);

    const prompt = `
        Create the core narrative for a realistic multidisciplinary patient case study for a medical student. The central theme is "${condition}".
        Please provide the entire response in the following language: ${language}.

        **Crucially, tailor the case for a student in **${discipline}**.

        ${difficultyInstructions}
        
        ${SYNTHESIS_GUIDELINE}

        **Your task is to generate ONLY the following sections:**
        1.  **title:** A concise title for the case.
        2.  **patientProfile:** A brief profile of the patient.
        3.  **presentingComplaint:** The main reason for seeking medical attention.
        4.  **history:** A detailed history of the present illness, past medical history, social history, and family history.
        5.  **procedureDetails (if applicable):** Details of the main procedure and ASA score.
        6.  **outcomes (if applicable):** The final outcome for the patient.

        **FINAL OUTPUT FORMAT:**
        Your entire response MUST be a single JSON object strictly adhering to the specified schema for the core patient case.
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
    
    return JSON.parse(response.text) as PatientCase;
};

// --- START: Parallel Generation Functions ---

// Helper for generating parts of the case
const generateCasePart = async (
    coreCase: PatientCase, 
    discipline: string, 
    difficulty: string, 
    language: string, 
    taskDescription: string, 
    responseSchema: any
) => {
    const ai = getAiClient();
    const difficultyInstructions = getDifficultyInstructions(difficulty);

    const coreCaseContext = `
        **Patient Case Context:**
        - **Title:** ${coreCase.title}
        - **Profile:** ${coreCase.patientProfile}
        - **Complaint:** ${coreCase.presentingComplaint}
        - **History:** ${coreCase.history}
    `;

    const prompt = `
        Based on the provided patient case context, generate the specific sections requested.
        Please provide the entire response in the following language: ${language}.

        ${coreCaseContext}

        **Crucially, tailor the content for a student in **${discipline}**.

        ${difficultyInstructions}
        
        ${SYNTHESIS_GUIDELINE}

        **Your task is to generate ONLY the following sections:**
        ${taskDescription}

        **FINAL OUTPUT FORMAT:**
        Your entire response MUST be a single JSON object strictly adhering to the specified schema.
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

    return JSON.parse(response.text);
};


export const generateMainDetails = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "- biochemicalPathway\n- multidisciplinaryConnections", mainDetailsSchema);

export const generateManagementAndContent = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "- disciplineSpecificConsiderations\n- educationalContent (1-2 items)", managementAndContentSchema);

export const generateEvidenceAndQuiz = (coreCase: PatientCase, discipline: string, difficulty: string, language: string) => 
    generateCasePart(coreCase, discipline, difficulty, language, "- traceableEvidence (3-4 items)\n- furtherReadings\n- quiz (5 questions)", evidenceAndQuizSchema);

export const generateKnowledgeMap = async (coreCase: PatientCase, discipline: string, difficulty: string, language: string): Promise<KnowledgeMapData> => {
    const rawMapData = await generateCasePart(coreCase, discipline, difficulty, language, "- A knowledge map with 8-12 nodes and their links, including concise summaries for each node.", knowledgeMapSchema);
    
    // Validate links to ensure they connect to existing nodes
    if (!rawMapData || !rawMapData.nodes || !rawMapData.links) {
        throw new Error("Model did not return valid knowledge map data.");
    }

    const validNodeIds = new Set(rawMapData.nodes.map((n: KnowledgeNode) => n.id));
    const validLinks = rawMapData.links.filter((l: KnowledgeLink) => validNodeIds.has(l.source) && validNodeIds.has(l.target));

    return {
        nodes: rawMapData.nodes,
        links: validLinks,
    };
};

// --- END: Parallel Generation Functions ---


export const enrichCaseWithWebSources = async (patientCase: PatientCase, language: string): Promise<{ newEvidence: TraceableEvidence[]; newReadings: FurtherReading[]; groundingSources: any[] }> => {
    const ai = getAiClient();

    const prompt = `
        Regarding the patient case titled "${patientCase.title}", which involves "${patientCase.presentingComplaint}", please act as a medical research assistant.
        Use Google Search to find the most recent, high-quality medical information to provide the following:
        1.  **Two (2) Traceable Evidence items:** Each item must be a specific clinical claim relevant to the case, supported by a citable source found in your search.
        2.  **Two (2) Further Reading suggestions:** These should be recent, relevant review articles or clinical guidelines.

        **CRITICAL:** Format your entire response as a single JSON object inside a markdown code block (\`\`\`json ... \`\`\`). Do not include any other text outside this block.
        The JSON object must have two keys: "traceableEvidence" and "furtherReadings".

        JSON structure example:
        \`\`\`json
        {
          "traceableEvidence": [
            { "claim": "A relevant clinical claim...", "source": "Citation from a top-tier journal or guideline, e.g., NEJM, The Lancet, UpToDate" },
            { "claim": "Another relevant clinical claim...", "source": "Another high-quality source" }
          ],
          "furtherReadings": [
            { "topic": "A specific topic for deeper study...", "reference": "Full citation or name of the article/guideline" },
            { "topic": "Another specific topic...", "reference": "Another reference" }
          ]
        }
        \`\`\`

        Please provide the response in the following language: ${language}.
    `;

    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.2,
        },
    }));

    const groundingSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    try {
        // Extract JSON from markdown code block
        const text = response.text;
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch || !jsonMatch[1]) {
            throw new Error("Model did not return a valid JSON code block.");
        }
        
        const parsedData = JSON.parse(jsonMatch[1]);
        const newEvidence = parsedData.traceableEvidence || [];
        const newReadings = parsedData.furtherReadings || [];

        return { newEvidence, newReadings, groundingSources };

    } catch (error) {
        console.error("Failed to parse grounded search results:", error);
        // Return empty arrays but still provide the sources if they exist
        return { newEvidence: [], newReadings: [], groundingSources };
    }
};

export const searchForSource = async (sourceQuery: string, language: string): Promise<{ summary: string; sources: any[] }> => {
    const ai = getAiClient();

    const prompt = `
        Please act as a medical research assistant. Use Google Search to find information about the following medical source: "${sourceQuery}".

        Provide a brief summary (2-3 sentences) of this source. If possible, identify its type (e.g., Randomized Controlled Trial, Systematic Review, Clinical Guideline) and its main conclusions or purpose.

        If you can find direct links to the source, please prioritize them.

        Respond in the following language: ${language}.
    `;

    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.1,
        },
    }));

    const summary = response.text;
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { summary, sources };
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

    const textParts = [
        `You are an expert cardiologist providing an educational interpretation of an ECG for a medical professional. Provide a systematic, step-by-step interpretation based on the provided data. Your response should be in Markdown format, using headings for each section.`,
        `## ECG Findings Provided:`,
        `- **Rate:** ${findings.rate || 'Not provided'} bpm`,
        `- **Rhythm:** ${findings.rhythm || 'Not provided'}`,
        `- **PR Interval:** ${findings.pr || 'Not provided'} ms`,
        `- **QRS Duration:** ${findings.qrs || 'Not provided'} ms`,
        `- **QTc Interval:** ${findings.qtc || 'Not provided'} ms`,
        `- **ST Segment:** ${findings.stSegment || 'Not provided'}`,
        `- **Other Findings/Context:** ${findings.other || 'None'}`,
        `\n## Systematic Interpretation Request:`,
        `Based on the data and the provided ECG image (if any), please generate a report covering:`,
        `1.  **Rhythm and Rate:** Analyze the rhythm and confirm the rate.`,
        `2.  **Axis:** Determine the axis if possible from the image.`,
        `3.  **Intervals:** Analyze PR, QRS, and QTc intervals.`,
        `4.  **Morphology:** Systematically comment on P waves, QRS complexes, ST segments, and T waves.`,
        `5.  **Summary / Impression:** Provide a primary interpretation and list 2-3 likely differential diagnoses.`,
        `\n**Disclaimer:** This is an AI-generated interpretation for educational purposes and should not be used for clinical decision-making. All findings must be verified by a qualified human physician.`,
        `\nPlease provide the entire response in ${language}.`
    ];
    const textPrompt = textParts.join('\n');

    const contentParts: any[] = [{ text: textPrompt }];

    if (imageBase64 && imageMimeType) {
        contentParts.push({
            inlineData: {
                data: imageBase64,
                mimeType: imageMimeType,
            },
        });
    }

    // ECG Interpretation benefits from thinking mode
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: { parts: contentParts },
        config: { 
            ...THINKING_CONFIG 
        }
    }));

    return response.text;
};


export const generateVisualAid = async (prompt: string): Promise<string> => {
    const ai = getAiClient();
    try {
        const response = await retryWithBackoff<GenerateImagesResponse>(() => ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: '4:3',
            },
        }));

        if (response.generatedImages && response.generatedImages.length > 0) {
            return response.generatedImages[0].image.imageBytes;
        } else {
            throw new Error("No image was generated by the API.");
        }
    } catch (error) {
        console.error("Error generating visual aid:", error);
        throw new Error("Failed to generate visual aid. The model may have refused the prompt.");
    }
};

export const checkDrugInteractions = async (drugNames: string[], language: string): Promise<string> => {
    const ai = getAiClient();

    const prompt = `
        As an expert clinical pharmacologist, analyze the following list of paediatric drugs for potential interactions. For each clinically significant interaction you identify, provide a concise summary in Markdown format.
        The user is a medical professional and requires clear, actionable information. Please respond in ${language}.

        Drugs to check:
        - ${drugNames.join('\n- ')}

        For each interaction, use the following structure:
        ### Interaction: [Drug A] & [Drug B]
        **Mechanism:** A brief explanation of the pharmacokinetic or pharmacodynamic mechanism.
        **Clinical Significance:** Describe the potential clinical outcome (e.g., increased risk of toxicity, reduced efficacy) and provide a brief management recommendation (e.g., "Monitor ECG," "Adjust dose," "Avoid combination if possible").

        If no significant interactions are found, respond with only this exact phrase: "No significant interactions were found for the selected drugs."
    `;

    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: {
            temperature: 0.2,
        },
    }));

    return response.text;
};

export const generateSpeech = async (text: string, voiceName: string): Promise<string> => {
    const ai = getAiClient();
    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName },
                    },
                },
            },
        }));
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("No audio data received from API.");
        }
        return base64Audio;

    } catch (error) {
        console.error("Error generating speech:", error);
        throw new Error("Failed to generate audio. Please try again.");
    }
};

export const getConceptConnectionExplanation = async (conceptA: string, conceptB: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
        For a medical student studying a patient case about "${caseContext}", explain the pathophysiological or clinical connection between "${conceptA}" and "${conceptB}".
        Keep the explanation concise (2-3 sentences, around 70-90 words) and focused on the most critical link between them in this specific medical context.
        The tone should be educational and clear.
        
        ${SYNTHESIS_GUIDELINE}

        Please provide the response in the following language: ${language}.
    `;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: prompt,
        config: {
            ...THINKING_CONFIG,
        },
    }));
    return response.text;
};

export const generateDiagramForDiscussion = async (prompt: string, chatContext: string, language: string): Promise<DiagramData> => {
    const ai = getAiClient();

    const fullPrompt = `
        You are an assistant creating educational visual aids for a medical student during a tutoring session.
        Based on the student's request below, and the preceding conversation for context, generate structured diagram data (nodes and links) for a simple, clear, interactive diagram.
        The diagram should visually explain the concept requested by the student.
        - Nodes should represent key entities (e.g., molecules, cells, organs, concepts).
        - Links should represent the relationships or processes connecting them.
        - Keep the diagram focused and uncluttered, with 4 to 8 nodes being ideal for clarity.

        The entire response MUST be in the following language: ${language}.

        ---
        Conversation Context:
        ${chatContext}
        ---
        Student's Request for Diagram:
        "${prompt}"
        ---

        Now, generate the JSON object for the diagramData. It must not be null.
    `;

    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: THINKING_MODEL,
        contents: fullPrompt,
        config: {
            ...THINKING_CONFIG,
            responseMimeType: "application/json",
            responseSchema: diagramDataSchema,
        },
    }));

    const parsedResponse = JSON.parse(response.text);

    // Basic validation
    if (!parsedResponse || !parsedResponse.nodes || !parsedResponse.links) {
        throw new Error("Model did not return valid diagram data.");
    }
    
    return parsedResponse as DiagramData;
};
