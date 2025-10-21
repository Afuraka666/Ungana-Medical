import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import type { PatientCase, KnowledgeMapData, KnowledgeNode, KnowledgeLink } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    multidisciplinaryConnections: {
      type: Type.ARRAY,
      description: "An array of connections between the patient's condition and various medical disciplines.",
      items: {
        type: Type.OBJECT,
        properties: {
          discipline: {
            type: Type.STRING,
            description: "The medical discipline (e.g., Pharmacology, Psychology, Sociology).",
            enum: ["Biochemistry", "Pharmacology", "Physiology", "Psychology", "Sociology", "Pathology", "Immunology", "Genetics", "Diagnostics", "Treatment"]
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
  required: ["title", "patientProfile", "presentingComplaint", "history", "multidisciplinaryConnections", "disciplineSpecificConsiderations", "educationalContent", "traceableEvidence", "furtherReadings", "quiz"],
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
                        enum: ["Biochemistry", "Pharmacology", "Physiology", "Psychology", "Sociology", "Pathology", "Immunology", "Genetics", "Diagnostics", "Treatment"]
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

export const getConceptAbstract = async (concept: string, caseContext: string, language: string): Promise<string> => {
    const prompt = `
        In the context of a patient with "${caseContext}", provide a concise, one-paragraph abstract (around 50-70 words) explaining the significance of "${concept}".
        The explanation should be stimulating for a medical student, highlighting its importance and encouraging further exploration of its connections.
        Please provide the response in the following language: ${language}.
    `;
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            temperature: 0.6,
        },
    });
    return response.text;
};

export const generateKnowledgeMap = async (patientCase: PatientCase, language: string): Promise<KnowledgeMapData> => {
    const model = "gemini-2.5-flash";

    const fullCaseText = `
        Title: ${patientCase.title}
        Profile: ${patientCase.patientProfile}
        Complaint: ${patientCase.presentingComplaint}
        History: ${patientCase.history}
        Connections: ${patientCase.multidisciplinaryConnections.map(c => `${c.discipline}: ${c.connection}`).join('\n')}
        Educational Content: ${patientCase.educationalContent?.map(e => `${e.title}: ${e.description}`).join('\n') || 'None'}
    `;

    const mapGenerationPrompt = `
        Based on the following patient case, extract the key concepts and their relationships to create a knowledge map.
        Identify at least 8-12 core concepts (nodes) and the causal or influential links between them.
        Ensure the nodes and links represent the multidisciplinary nature of the case.
        The goal is to create a visual graph for a medical student to understand the interconnectedness of these concepts.
        Please provide the response in the following language: ${language}.

        Patient Case Text:
        ---
        ${fullCaseText}
        ---
    `;

    const mapResponse = await ai.models.generateContent({
        model: model,
        contents: mapGenerationPrompt,
        config: {
        responseMimeType: "application/json",
        responseSchema: knowledgeMapSchema,
        temperature: 0.5,
        },
    });

    const rawMapData = JSON.parse(mapResponse.text);

    // Data validation and cleanup
    const validNodeIds = new Set(rawMapData.nodes.map((n: KnowledgeNode) => n.id));
    const validLinks = rawMapData.links.filter((l: KnowledgeLink) => validNodeIds.has(l.source) && validNodeIds.has(l.target));

    const mapData: KnowledgeMapData = {
        nodes: rawMapData.nodes,
        links: validLinks,
    };

    return mapData;
};


export const generatePatientCaseAndMap = async (condition: string, discipline: string, language: string): Promise<{ case: PatientCase; mapData: KnowledgeMapData }> => {
  const model = "gemini-2.5-flash";

  // Step 1: Generate the detailed patient case
  const caseGenerationPrompt = `
    Create a comprehensive, realistic, and academically rigorous multidisciplinary patient case study for a medical student. The central theme is "${condition}".
    The case must be complex, integrating concepts from various fields. Provide a rich narrative for the patient's history.
    Please provide the entire response in the following language: ${language}.

    **Crucially, tailor the case's management plan and key considerations for a student in **${discipline}**.

    **RULES FOR RIGOR - YOU MUST FOLLOW THESE:**
    1.  **Label Unverified Claims:** For any clinical reasoning that is inferential, speculative, or not based on established evidence, you MUST label it clearly in the text using tags like \`[Inference]\`, \`[Speculation]\`, or \`[Unverified]\`.
    2.  **Provide Traceable Evidence:** For at least 2-3 key clinical statements, provide a specific source. **Prioritize citing high-quality systematic reviews or major clinical practice guidelines.** Use the format: '(Systematic Review) [Citation]'.
    3.  **Include Educational Content:** Add 1-2 pieces of rich educational content. For each, provide a title, a detailed text description, and a reference. **Crucially, if the content type is 'Diagram', you MUST also generate the structured \`diagramData\` containing nodes and links for an interactive visualization. If a diagram is not applicable, set \`diagramData\` to null.**
    4.  **Suggest Further Readings:** List 2-3 high-quality references (e.g., review articles, clinical guidelines) for deeper learning.
    5.  **Create a Quiz:** Generate a multiple-choice quiz with 3 questions to test understanding of the key multidisciplinary concepts in this case. For each question, provide four string options, the 0-based index of the correct answer, and a brief explanation for the answer.
  `;

  const caseResponse = await ai.models.generateContent({
    model: model,
    contents: caseGenerationPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: patientCaseSchema,
      temperature: 0.8,
    },
  });

  const patientCase = JSON.parse(caseResponse.text) as PatientCase;

  // Step 2: Generate the knowledge map from the case
  const mapData = await generateKnowledgeMap(patientCase, language);

  return { case: patientCase, mapData };
};

export const generateVisualAid = async (prompt: string): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: '4:3',
            },
        });

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