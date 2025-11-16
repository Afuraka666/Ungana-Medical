

import { GoogleGenAI, Type, GenerateContentResponse, Modality, GenerateImagesResponse } from "@google/genai";
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink, TraceableEvidence, FurtherReading, DiagramData } from '../types';

const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * A utility function to retry an API call with exponential backoff.
 * This is useful for handling transient errors like 503 "model overloaded".
 * @param apiCall The async function to call.
 * @param maxRetries The maximum number of retries.
 * @param initialDelay The initial delay in milliseconds.
 * @returns The result of the API call.
 */
export const retryWithBackoff = async <T>(
  apiCall: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 500
): Promise<T> => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await apiCall();
    } catch (error: any) {
      attempt++;
      
      // Create a searchable string from the error. This is more robust because it properly
      // serializes properties of Error objects, which JSON.stringify alone does not do.
      let searchableString = error?.message || '';
      try {
        const stringified = JSON.stringify(error, Object.getOwnPropertyNames(error));
        if (stringified !== '{}') {
          searchableString += ` ${stringified}`;
        }
      } catch (e) {
        // Fallback for non-serializable errors
        if (!searchableString) {
          searchableString = String(error);
        }
      }

      const errorMessage = searchableString.toLowerCase();
      // Check for retryable server errors (e.g., 500, 503, overloaded, unavailable)
      const isRetryable = errorMessage.includes("500") || errorMessage.includes("internal server error") || errorMessage.includes("503") || errorMessage.includes("overloaded") || errorMessage.includes("unavailable") || errorMessage.includes("try again later");
      
      if (isRetryable && attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 1000; // Add jitter
        console.warn(`API call failed with retryable error (attempt ${attempt}/${maxRetries}). Retrying in ${delay.toFixed(0)}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Not a retryable error or max retries reached, throw
        throw error;
      }
    }
  }
  // This part should not be reachable due to the throw in the loop
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

const patientCaseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "A concise title for the patient case, e.g., 'Type 2 Diabetes Mellitus with Complicating Social Factors'." },
    patientProfile: { type: Type.STRING, description: "A brief profile of the patient including age, gender, and occupation." },
    presentingComplaint: { type: Type.STRING, description: "The main reason the patient is seeking medical attention." },
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
    },
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
          connection: { type: Type.STRING, description: "A detailed explanation of how this discipline connects to the patient's case." },
        },
        required: ["discipline", "connection"],
      },
    },
    disciplineSpecificConsiderations: {
        type: Type.ARRAY,
        description: "An array of management considerations tailored to a specific medical discipline.",
        items: {
          type: Type.OBJECT,
          properties: {
            aspect: { type: Type.STRING, description: "The specific aspect of care (e.g., 'Diagnostic Imaging', 'Post-operative Care', 'Patient Education')." },
            consideration: { type: Type.STRING, description: "The detailed consideration or action plan for this aspect from the specified discipline's viewpoint." }
          },
          required: ["aspect", "consideration"]
        }
    },
     educationalContent: {
        type: Type.ARRAY,
        description: "An array of rich educational content like diagrams or formulas relevant to the case.",
        items: educationalContentSchema
    },
    traceableEvidence: {
        type: Type.ARRAY,
        description: "An array of key claims made in the case study backed by specific, citable evidence or sources.",
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
        description: "A multiple-choice quiz with 3-5 questions to test understanding of the case.",
        items: quizQuestionSchema
    }
  },
  required: ["title", "patientProfile", "presentingComplaint", "history", "biochemicalPathway", "multidisciplinaryConnections", "disciplineSpecificConsiderations", "educationalContent", "traceableEvidence", "furtherReadings", "quiz"],
};

const knowledgeMapSchema = {
    type: Type.OBJECT,
    properties: {
        nodes: {
            type: Type.ARRAY,
            description: "An array of key concepts or entities from the patient case.",
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
                },
                required: ["id", "label", "discipline"]
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

const patientCaseAndMapSchema = {
    type: Type.OBJECT,
    properties: {
        patientCase: patientCaseSchema,
        knowledgeMap: knowledgeMapSchema
    },
    required: ["patientCase", "knowledgeMap"]
};

export const getConceptAbstract = async (concept: string, caseContext: string, language: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
        In the context of a patient with "${caseContext}", provide a concise, one-paragraph abstract (around 50-70 words) explaining the significance of "${concept}".
        The explanation should be stimulating for a medical student, highlighting its importance and encouraging further exploration of its connections.
        Please provide the response in the following language: ${language}.
    `;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            temperature: 0.4,
        },
    }));
    return response.text;
};

export const generatePatientCaseAndMap = async (condition: string, discipline: string, difficulty: string, language: string): Promise<{ case: PatientCase; mapData: KnowledgeMapData }> => {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

  let difficultyInstructions = '';
  switch (difficulty.toLowerCase()) {
      case 'beginner':
          difficultyInstructions = `
              **Difficulty Level: Beginner**
              - The case history should be straightforward with a clear, classic presentation of the condition.
              - Limit comorbidities to one, if any. The narrative should be easy to follow.
              - Focus on 2-3 core, high-yield multidisciplinary connections.
              - The quiz questions should be direct recall questions based on the text.
          `;
          break;
      case 'advanced':
          difficultyInstructions = `
              **Difficulty Level: Advanced**
              - The case must be highly complex, potentially with a rare presentation or multiple significant comorbidities that interact.
              - **Crucially, the narrative must include subtle diagnostic clues, atypical findings, and potential "red herring" details.** These elements should be carefully crafted to make the diagnostic process challenging and require careful clinical reasoning.
              - **The case must support a differential diagnosis of at least 3-4 plausible conditions.** The history and findings should contain specific, subtle information that helps distinguish the final diagnosis from these alternatives.
              - Explore at least 5-6 deep multidisciplinary connections, including less obvious psychosocial, ethical, or public health dimensions.
              - The quiz questions must be challenging, requiring synthesis of multiple concepts, evaluation of management options, and **explicitly addressing the differential diagnoses presented in the case.**
          `;
          break;
      case 'intermediate':
      default:
          difficultyInstructions = `
              **Difficulty Level: Intermediate**
              - The case should have moderate complexity, with one or two confounding factors or comorbidities.
              - Involve 3-5 clear and relevant multidisciplinary connections.
              - The quiz questions should test comprehension and application of the case details, requiring some synthesis of information.
          `;
          break;
  }

  const combinedGenerationPrompt = `
    Create a comprehensive, realistic, and academically rigorous multidisciplinary patient case study for a medical student. The central theme is "${condition}".
    The case must be complex, integrating concepts from various fields. Provide a rich narrative for the patient's history. Involve aspects of rehabilitation, including physiotherapy and occupational therapy where relevant.
    Please provide the entire response in the following language: ${language}.

    **Crucially, tailor the case's management plan and key considerations for a student in **${discipline}**.

    ${difficultyInstructions}

    **RULES FOR RIGOR - YOU MUST FOLLOW THESE:**
    1.  **Stick to Proven Facts:** Do NOT offer opinions, speculations, or unverified synthesis. Every clinical statement and piece of data must be based on established medical facts and evidence. The content must be grounded in the latest available research.
    2.  **Provide High-Quality Traceable Evidence:** For at least 3-4 key clinical statements, provide a specific source. You MUST cite evidence from high-impact, peer-reviewed sources. Prioritize evidence from the following types, in order of preference: Systematic Reviews, Meta-Analyses, Randomized Controlled Trials (RCTs), and major Clinical Practice Guidelines. Use a clear citation format, e.g., '(Systematic Review) [Citation]' or '(RCT) [Citation]'.
    3.  **Include a Detailed Biochemical Pathway Section:** Create a specific section for 'biochemicalPathway'. This must focus on a single, core biochemical or physiological mechanism central to the case.
        *   **If it's a visual pathway (Type: "Diagram"):** The 'diagramData' MUST be comprehensive. Include at least 6-8 key molecular nodes (e.g., substrates, enzymes, products, cellular locations) and the links representing the steps of the pathway. The goal is a detailed, clear educational map. The description should explain the pathway's relevance to the patient's condition.
        *   **If it's a non-diagram mechanism (e.g., a physiological process):** The description must be expanded to 2-3 detailed paragraphs, providing an in-depth explanation for a medical student. You MUST include a specific, high-quality reference, such as a review article from a major journal (e.g., NEJM, The Lancet).
    4.  **Include Educational Content:** Add 1-2 pieces of rich educational content in the 'educationalContent' array. These should be distinct from the biochemical pathway and can cover other topics like pharmacology, pathophysiology graphs, etc. For each, provide a title, a detailed text description, and a reference. **Crucially, if the content type is 'Diagram', you MUST also generate the structured \`diagramData\` containing nodes and links for an interactive visualization. If a diagram is not applicable, set \`diagramData\` to null.**
    5.  **Suggest Further Readings:** List 2-3 high-quality references (e.g., review articles, clinical guidelines) for deeper learning.
    6.  **Create a Quiz:** Generate a multiple-choice quiz with 3 questions to test understanding of the key multidisciplinary concepts in this case. For each question, provide four string options, the 0-based index of the correct answer, and a brief explanation for the answer. The quiz difficulty should match the overall case difficulty.
    7.  **Include Procedural and Outcome Data:** If applicable, provide plausible details for the main procedure, the patient's ASA physical status, and the final outcome (ICU admission, length of stay, summary).

    **KNOWLEDGE MAP GENERATION:**
    Simultaneously, based on the patient case you are creating, you MUST extract the key concepts and their relationships to create a knowledge map.
    - Identify at least 8-12 core concepts (nodes).
    - For each node, provide a unique ID, a label, and its primary medical discipline.
    - Identify the causal or influential links between these nodes. For each link, provide the source ID, target ID, and a brief description of the relationship.
    - The nodes and links must represent the multidisciplinary nature of the case.
    - The goal is to create a visual graph for a medical student to understand the interconnectedness of these concepts.

    **FINAL OUTPUT FORMAT:**
    Your entire response MUST be a single JSON object with two top-level keys: "patientCase" and "knowledgeMap". The content for each key must strictly adhere to their respective schemas.
  `;

  const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
    model: model,
    contents: combinedGenerationPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: patientCaseAndMapSchema,
      temperature: 0.4,
    },
  }));
  
  const parsedResponse = JSON.parse(response.text);
  const patientCase = parsedResponse.patientCase as PatientCase;
  const rawMapData = parsedResponse.knowledgeMap;
  
  // Data validation and cleanup for the map
  if (!rawMapData || !rawMapData.nodes || !rawMapData.links) {
    throw new Error("Model did not return valid knowledge map data.");
  }

  const validNodeIds = new Set(rawMapData.nodes.map((n: KnowledgeNode) => n.id));
  const validLinks = rawMapData.links.filter((l: KnowledgeLink) => validNodeIds.has(l.source) && validNodeIds.has(l.target));

  const mapData: KnowledgeMapData = {
      nodes: rawMapData.nodes,
      links: validLinks,
  };

  return { case: patientCase, mapData };
};

export const enrichCaseWithWebSources = async (patientCase: PatientCase, language: string): Promise<{ newEvidence: TraceableEvidence[]; newReadings: FurtherReading[]; groundingSources: any[] }> => {
    const ai = getAiClient();
    const model = "gemini-2.5-flash";

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
        model: model,
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
    const model = "gemini-2.5-flash";

    const prompt = `
        Please act as a medical research assistant. Use Google Search to find information about the following medical source: "${sourceQuery}".

        Provide a brief summary (2-3 sentences) of this source. If possible, identify its type (e.g., Randomized Controlled Trial, Systematic Review, Clinical Guideline) and its main conclusions or purpose.

        If you can find direct links to the source, please prioritize them.

        Respond in the following language: ${language}.
    `;

    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: model,
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

    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: contentParts },
        config: { temperature: 0.3 }
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
    const model = "gemini-2.5-flash";

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
        model: model,
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
        Please provide the response in the following language: ${language}.
    `;
    const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            temperature: 0.4,
        },
    }));
    return response.text;
};

export const generateDiagramForDiscussion = async (prompt: string, chatContext: string, language: string): Promise<DiagramData> => {
    const ai = getAiClient();
    const model = "gemini-2.5-flash";

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
        model: model,
        contents: fullPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: diagramDataSchema,
            temperature: 0.3,
        },
    }));

    const parsedResponse = JSON.parse(response.text);

    // Basic validation
    if (!parsedResponse || !parsedResponse.nodes || !parsedResponse.links) {
        throw new Error("Model did not return valid diagram data.");
    }
    
    return parsedResponse as DiagramData;
};
