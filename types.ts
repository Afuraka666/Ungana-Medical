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
}

export enum EducationalContentType {
  DIAGRAM = "Diagram",
  GRAPH = "Graph",
  FORMULA = "Formula",
  IMAGE = "Image",
}

export interface EducationalContent {
  type: EducationalContentType;
  title: string;
  description: string; // AI-generated description of the visual content
  reference: string;
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

export interface PatientCase {
  title: string;
  patientProfile: string;
  presentingComplaint: string;
  history: string;
  multidisciplinaryConnections: MultidisciplinaryConnection[];
  disciplineSpecificConsiderations: DisciplineSpecificConsideration[];
  educationalContent: EducationalContent[];
  traceableEvidence: TraceableEvidence[];
  furtherReadings: FurtherReading[];
  quiz: QuizQuestion[];
}

export interface KnowledgeNode {
  id: string;
  label: string;
  discipline: Discipline;
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