export {
  llmCall,
  llmStructured,
  llmJson,
  llmVision,
  openRouterHealthCheck,
  sanitizeJsonSchemaForProviders,
  type ChatMessage,
  type ChatMessageRole,
  type ImageContentPart,
  type LLMCallOptions,
  type LLMResponse,
  type StructuredOutputOptions,
  type TextContentPart,
  type ToolCall,
  type ToolDefinition,
} from "./openrouter-client.js";

export { MODELS, MODEL_ROUTING } from "./model-config.js";

export {
  AGENT_RESPONSE_SCHEMA,
  EMPTY_AGENT_RESPONSE,
  SKILL_CANDIDATE_SCHEMA,
  TOOL_REQUEST_SCHEMA,
  agentResponseSchema,
  skillCandidateSchema,
  toolRequestSchema,
  validateAgentResponse,
  type AgentResponse,
  type SkillCandidate,
  type ToolRequest,
} from "./schemas/agent-response-schema.js";

export {
  AUTONOMOUS_STEP_SCHEMA,
  autonomousStepSchema,
  validateAutonomousStep,
  type AutonomousStep,
} from "./schemas/autonomous-step-schema.js";

export {
  INTENT_SCHEMA,
  UNKNOWN_INTENT_RESULT,
  intentResultSchema,
  validateIntentResult,
  type IntentEntity,
  type IntentResult,
} from "./schemas/intent-schema.js";

export {
  MEMORY_CANDIDATE_SCHEMA,
  memoryCandidateSchema,
  type MemoryCandidate,
} from "./schemas/memory-candidate-schema.js";

export {
  MEMORY_OPERATION_SCHEMA,
  memoryOperationSchema,
  validateMemoryOperation,
  type MemoryOperation,
} from "./schemas/memory-operation-schema.js";
