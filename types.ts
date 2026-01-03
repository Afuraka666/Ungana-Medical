
export enum Discipline {
  BIOCHEMISTRY = "Biochemistry",
  PHARMACOLOGY = "Pharmacology",
  PHYSIOLOGY = "Physiology",
  PSYCHOLOGY = "Psychology",
  SOCIOLOGY = "Sociology",
  PATHOLOGY = "Pathology",
  IMMUNOLOGY = "Immunology",
  GENETICS = "Genetics",
  DIAGNOSTICS = "Diagnostics",
  TREATMENT = "Treatment",
  PHYSIOTHERAPY = "Physiotherapy",
  OCCUPATIONAL_THERAPY = "Occupational Therapy",
  ANAESTHESIA = "Anaesthesia",
  PAIN_MANAGEMENT = "Pain Management",
  NURSING = "Nursing",
  NUTRITION = "Nutrition & Dietetics",
  SOCIAL_WORK = "Social Work",
  SPEECH_LANGUAGE_THERAPY = "Speech & Language Therapy",
}

export enum EducationalContentType {
  DIAGRAM = "Diagram",
  GRAPH = "Graph",
  FORMULA = "Formula",
  IMAGE = "Image",
}

export interface DiagramNode {
  id: string;
  label: string;
  description?: string;
}

export interface DiagramLink {
  source: string;
  target: string;
  label: string;
}

export interface DiagramData {
  nodes: DiagramNode[];
  links: DiagramLink[];
}

export interface EducationalContent {
  type: EducationalContentType;
  title: string;
  description: string; // AI-generated description of the visual content
  reference: string;
  diagramData?: DiagramData;
  imageData?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface MultidisciplinaryConnection {
  discipline: Discipline;
  connection: string;
}

export interface DisciplineSpecificConsideration {
  aspect: string;
  consideration: string;
}

export interface TraceableEvidence {
  claim: string;
  source: string;
}

export interface FurtherReading {
  topic: string;
  reference: string;
}

export interface PatientOutcome {
  icuAdmission: boolean;
  lengthOfStayDays: number;
  outcomeSummary: string;
}

export interface ProcedureDetails {
  procedureName: string;
  asaScore: '1' | '2' | '3' | '4' | '5' | '6' | '1E' | '2E' | '3E' | '4E' | '5E' | '6E';
}

export interface ChatMessage {
    role: 'user' | 'model' | 'system';
    text: string;
    diagramData?: DiagramData;
    imageData?: string;
    timestamp?: number;
}

export interface PatientCase {
  title: string;
  patientProfile: string;
  presentingComplaint: string;
  history: string;
  procedureDetails?: ProcedureDetails;
  outcomes?: PatientOutcome;
  biochemicalPathway?: EducationalContent;
  multidisciplinaryConnections?: MultidisciplinaryConnection[];
  disciplineSpecificConsiderations?: DisciplineSpecificConsideration[];
  educationalContent?: EducationalContent[];
  traceableEvidence?: TraceableEvidence[];
  furtherReadings?: FurtherReading[];
  quiz?: QuizQuestion[];
  // Map of discussion topic IDs to array of chat messages
  discussions?: Record<string, ChatMessage[]>;
}

export interface KnowledgeNode {
  id: string;
  label: string;
  discipline: Discipline;
  summary: string;
}

export interface KnowledgeLink {
  source: string;
  target: string;
  description: string;
}

export interface KnowledgeMapData {
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
}

export interface SavedCase {
  id: string;
  title: string;
  savedAt: string;
  caseData: PatientCase;
  mapData: KnowledgeMapData;
}

export interface Snippet {
  id: string;
  title: string;
  content: string;
  savedAt: string;
  diagramData?: DiagramData;
  mapData?: KnowledgeMapData;
  imageData?: string;
}

export interface InteractionState {
  caseGenerated: boolean;
  caseEdited: boolean;
  caseSaved: boolean;
  snippetSaved: boolean;
  nodeClicks: number;
}

export interface Tip {
  id: string;
  title: string;
  text: string;
  trigger: (state: InteractionState) => boolean;
}

export interface LoggedEvent {
  id: number;
  name: string;
  params: Record<string, any>;
  timestamp: string;
}

export interface AnalyticsContextType {
  logEvent: (eventName: string, params?: Record<string, any>) => void;
  eventLog: LoggedEvent[];
}

// FIX: Added EcgFindings interface to fix the "Cannot find name 'EcgFindings'" error in services/geminiService.ts.
export interface EcgFindings {
  rate: string;
  rhythm: string;
  pr: string;
  qrs: string;
  qtc: string;
  stSegment: string;
  other: string;
}
