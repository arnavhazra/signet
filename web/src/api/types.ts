/** Frozen runtime + admin API types. Request bodies match the orchestrator contract. */

export type ArtifactType =
  | 'choice_cards'
  | 'toggle'
  | 'numeric_input'
  | 'approval_card'
  | string;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type ChoiceOption = {
  id?: string;
  value?: string | number | boolean;
  label?: string;
  title?: string;
  description?: string;
  helperText?: string;
};

export type ApprovalAction = {
  id?: string;
  value?: string | number | boolean;
  label?: string;
  title?: string;
  variant?: string;
};

export type ApprovalField = {
  label?: string;
  key?: string;
  name?: string;
  value?: JsonValue;
  format?: string;
};

export type WorkflowStep = {
  questionId: string;
  order: number;
  title: string;
  helperText?: string;
  artifactType: ArtifactType;
  config: JsonObject;
  required?: boolean;
};

export type ActiveWorkflow = {
  workflowId: string;
  version: number;
  slug: string;
  name: string;
  steps: WorkflowStep[];
};

export type SessionNode = {
  id: string;
  questionId?: string;
  title: string;
  artifactType: ArtifactType;
  config: JsonObject;
  helperText?: string;
  required?: boolean;
};

export type Citation = {
  id?: string;
  source?: string;
  timestamp?: string;
  asOf?: string;
  label?: string;
  title?: string;
  rowId?: string;
  ref?: string;
  uri?: string;
  [key: string]: JsonValue | undefined;
};

export type SessionSnapshot = {
  sessionId: string;
  status: string;
  currentNode: SessionNode | null;
  accumulatedAnswers: JsonObject;
  derived: JsonObject;
  citations: Citation[] | JsonValue;
  workflowId: string;
  version: number;
  updatedAt?: string;
  expectedUpdatedAt?: string;
  awaitingChecker?: boolean;
  requestId?: string;
};

export type InboxItem = {
  sessionId: string;
  accountId: string;
  securityId: string;
  bookQty: number;
  custodianQty: number;
  delta: number;
  asOf: string;
  status: string;
  awaitingChecker: boolean;
  createdAt: string;
  workflowSlug: string;
};

export type InboxResponse = {
  items: InboxItem[];
};

export type SessionReplay = {
  workflowId: string;
  version: number;
  slug: string;
  stripped: JsonValue;
  citations: Citation[] | JsonValue;
  accumulatedAnswers: JsonObject;
  derived: JsonObject;
  createdAt: string;
};

export type ExceptionEvent = {
  accountId: string;
  securityId: string;
  bookQty: number;
  custodianQty: number;
  asOf: string;
  source: string;
};

export type CreateWorkflowRequest = {
  slug: string;
  name: string;
  definition: JsonValue;
};

export type PreviewRequest = {
  inputs: JsonObject;
};

export type AdvanceRequest = {
  inputs: { [questionId: string]: JsonValue };
  expectedUpdatedAt?: string;
};

export type AdminWorkflow = {
  id: string;
  slug?: string;
  name?: string;
  version?: number;
  published?: boolean;
  status?: string;
  definition?: JsonValue;
  [key: string]: JsonValue | undefined;
};

export type AuditEvent = {
  id?: string;
  at?: string;
  timestamp?: string;
  ts?: string;
  createdAt?: string;
  type?: string;
  event?: string;
  eventType?: string;
  action?: string;
  actor?: string;
  nodeId?: string;
  questionId?: string;
  sessionId?: string;
  accountId?: string;
  detail?: JsonValue;
  payload?: JsonValue;
  [key: string]: JsonValue | undefined;
};

export type AuditQuery = {
  accountId?: string;
  eventType?: string;
  sessionId?: string;
};

export type LintIssue = {
  severity?: string;
  message?: string;
  nodeId?: string;
  edgeIndex?: number;
};

export type LintResult = {
  valid?: boolean;
  errors: string[];
  warnings: string[];
};

export type AgentDecision = 'requires_human' | 'denied' | 'auto_executed' | string;

export type AgentProposeRequest = {
  text?: string;
  intent?: string;
  accountId?: string;
  params?: JsonObject;
  rationale?: string;
};

export type AgentPolicy = {
  rule?: string;
  threshold?: number;
  delta?: number;
  [key: string]: JsonValue | undefined;
};

export type AgentProposal = {
  intent?: string;
  accountId?: string;
  params?: JsonObject;
  rationale?: string;
  text?: string;
  [key: string]: JsonValue | undefined;
};

export type AgentProposeResponse = {
  decision: AgentDecision;
  policy: AgentPolicy;
  sessionId: string | null;
  approvalUrl: string | null;
  auditEventId: string | null;
  proposal: AgentProposal;
};
