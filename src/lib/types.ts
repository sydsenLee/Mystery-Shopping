// Core data model.
// OEM -> Exercise -> Questionnaire version (sections, questions) -> Visits (one per dealership assessment) -> Responses.
// Dealerships live in a shared master list so names stay consistent across exercises.

export type ID = string;

export interface Oem {
  id: ID;
  name: string;
  /** Small PNG/JPEG data URL, resized on upload. */
  logo?: string;
  /** Hex brand colour used on report headers. */
  color?: string;
  createdAt: string;
}

export interface Dealership {
  id: ID;
  name: string;
  /** Optional brand this dealership sells. Competitor benchmarking exercises can mix brands. */
  oemId?: ID;
  region?: string;
  city?: string;
  code?: string;
  archived?: boolean;
  createdAt: string;
}

export type ExerciseStatus = 'planning' | 'active' | 'closed';

export interface Exercise {
  id: ID;
  oemId: ID;
  name: string;
  periodStart?: string; // yyyy-mm-dd
  periodEnd?: string;
  region?: string;
  notes?: string;
  status: ExerciseStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response types. Only the Yes/No family is scored for compliance.
 * Rating, multiple choice and text are captured and reported but never
 * change compliance percentages.
 */
export type QuestionType = 'yes_no' | 'yes_no_na' | 'rating5' | 'choice' | 'text';

export interface Question {
  id: ID;
  text: string;
  type: QuestionType;
  /** Set for sub-questions (one level deep). */
  parentId?: ID;
  /** A heading such as "Did the salesperson:" that groups sub-questions and is not answered itself. */
  isGroup?: boolean;
  /** Must be answered before a visit can be marked complete. */
  required: boolean;
  /**
   * Negative behaviour question, e.g. "Did the salesperson open with 'Can I help you?'".
   * For these, a No answer is the compliant answer.
   */
  reverse?: boolean;
  /** Options for 'choice' questions. */
  options?: string[];
  /** Guidance shown to the shopper. */
  hint?: string;
}

export interface Section {
  id: ID;
  title: string;
  questions: Question[]; // in display order; sub-questions follow their parent
}

export interface QuestionnaireVersion {
  id: ID;
  exerciseId: ID;
  version: number;
  sections: Section[];
  createdAt: string;
  /** Free text on what changed. */
  note?: string;
}

export type YesNoValue = 'yes' | 'no' | 'na';
export type ResponseValue = YesNoValue | number | string;

export interface ResponseEntry {
  value: ResponseValue;
  comment?: string;
  at: string;
}

export type VisitStatus = 'in_progress' | 'complete';

export interface Visit {
  id: ID;
  exerciseId: ID;
  dealershipId: ID;
  questionnaireVersionId: ID;
  /** Team / shopper reference, e.g. "Team 4". */
  team?: string;
  shopper?: string;
  salesperson?: string;
  visitDate?: string;
  notes?: string;
  status: VisitStatus;
  responses: Record<ID, ResponseEntry>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Template {
  id: ID;
  name: string;
  description?: string;
  sections: Section[];
  createdAt: string;
}

export interface Collections {
  oems: Oem[];
  dealerships: Dealership[];
  exercises: Exercise[];
  versions: QuestionnaireVersion[];
  visits: Visit[];
  templates: Template[];
}

export type CollectionName = keyof Collections;
export const COLLECTION_NAMES: CollectionName[] = ['oems', 'dealerships', 'exercises', 'versions', 'visits', 'templates'];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  yes_no: 'Yes / No',
  yes_no_na: 'Yes / No / N/A',
  rating5: 'Rating out of 5',
  choice: 'Multiple choice',
  text: 'Text / comment',
};
