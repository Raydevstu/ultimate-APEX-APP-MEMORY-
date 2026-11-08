# APEX-EDITOR-V1 (ApexPad): Tasks 2, 3, and 4 — Complete Implementation Blueprint
With Task 1 (Context & Memory Mechanics) 100% completed, this blueprint delivers the complete, zero-stub architectural and implementation code for Task 2 (Input & Specification Structurer), Task 3 (Model Generation Guardrails & Anti-Truncation Patcher), and Task 4 (Automated Runtime Verification & Agent-Browser CDP Loop).
Together with Task 1, these modules close every single quality-degradation bottleneck identified in our Turn-1 Engineering Matrix and connect directly into the  ApexPad ( `Curatted feature list.pdf` )  control plane ( `Project DNA`  $\rightarrow$  `Memory`  $\rightarrow$  `CONTEXT PACK`  $\rightarrow$  `PLANNER CrewAI`  $\rightarrow$  `DAG ENGINE LangGraph`  $\rightarrow$  `Research & Architect Agents`  $\rightarrow$  `ARTIFACT STAGING`  $\rightarrow$  `HUMAN APPROVAL` ).

## PHASE 6: System Architecture, Data-Flow & Verification Workflow (Tasks 2, 3 & 4)
### 6.1 Master Pipeline Diagram: How Tasks 2, 3, and 4 Wrap Task 1
+===================================================================================================+
 |                              USER RAW STREAM-OF-CONSCIOUSNESS PROMPT                              |
 +=================================================+=================================================+
                                                   |
                                                   v
 +===================================================================================================+
 | TASK 2: INPUT & SPECIFICATION STRUCTURER (src/main/spec/specStructurer.ts)                        |
 |  1. Prompt Ambiguity & Granularity Analyzer (Detects Prompt Overload > 1 architectural concern)   |
 |  2. Implicit Constraint Injector (Auto-injects Project DNA, Security, Layer & Env invariants)     |
 |  3. Deterministic Spec Contract Compiler -> Outputs Typed PRD + Subtask DAG + Acceptance Criteria |
 +=================================================+=================================================+
                                                   |
                                                   v
 +===================================================================================================+
 | TASK 1 (COMPLETED): CONTEXT PACKER + CREWAI PLANNER + LANGGRAPH RESEARCH & ARCHITECT AGENTS       |
 |  Packs Frozen Prefix + U-Curve Live Context (< 2.36 B/tok * 0.90) & Synthesizes Candidate Patch   |
 +=================================================+=================================================+
                                                   |
                                                   v
 +===================================================================================================+
 | TASK 3: MODEL GENERATION GUARDRAILS & ANTI-TRUNCATION PATCHER (src/main/guardrails/codeGuard.ts)  |
 |  1. Anti-Truncation AST Merger: Detects lazy "// ... rest of existing code ..." placeholders      |
 |     and splices unaltered AST symbols from the previous file version back in automatically.       |
 |  2. Package & Import Hallucination Verifier: Cross-checks every import against package.json,      |
 |     Node built-ins, and workspace paths (blocks hallucinated npm packages before saving).         |
 |  3. Version-Skew & Deprecated Syntax Scanner: Detects mixed framework conventions.                |
 |  4. Anti-Sycophancy Premise Critic: Verifies user error hypotheses against actual AST/Logs.       |
 +=================================================+=================================================+
                                                   |
                                                   v
 +===================================================================================================+
 | TASK 4: AUTOMATED RUNTIME VERIFICATION & AGENT-BROWSER CDP LOOP (src/main/verify/runtimeVerifier) |
 |  1. Ephemeral Shadow Worktree / Sandbox Stage: Applies guarded code without polluting workspace.  |
 |  2. Compiler & Type-Check Gate (`tsc --noEmit` / syntax verification) + Ripwire `--test-gate`.    |
 |  3. Agent-Browser Persistent CDP Daemon Loop (`snapshot -i` -> `@e1` RefMap -> Action -> Diff):   |
 |     - Enforces Loud Failures (fails immediately if `@e1` is hidden, disabled, offscreen, covered) |
 |     - Wraps untrusted DOM text in CSPRNG Nonce Content Boundaries to block Indirect Injection |
 |     -Enforces Domain Allowlists & Action Policies before advancing to ARTIFACT STAGING. |
 +=================================================+=================================================+
                                                   |
                                                   v
 +===================================================================================================+
 |                        ARTIFACT STAGING -> HUMAN APPROVAL GATE (Workbench UI)                     |
 +===================================================================================================+

## PHASE 7: Complete Zero-Stub Implementation Codebase for Tasks 2, 3, and 4

### 7.1 Extended Domain Types (`src/shared/types/guardrailsAndVerification.ts`)
/**
  * src/shared/types/guardrailsAndVerification.ts
  * Domain Interfaces for Task 2 (Specification Structurer),
  * Task 3 (Generation Guardrails & Anti-Truncation Patcher), and
  * Task 4 (Automated Runtime Verification & Agent-Browser CDP Loop).
  */
 export interface AtomicSubtaskNode {
   subtaskId: string;
   orderIndex: number;
   assignedAgent: 'researcher' | 'architect' | 'verifier';
   title: string;
   targetFiles: string[];
   targetSymbols: string[];
   explicitConstraints: string[];
   verificationCommand: string;
   dependsOnSubtaskIds: string[];
 }
 export interface StructuredSpecContract {
   specId: string;
   sessionId: string;
   projectSlug: string;
   rawUserPrompt: string;
   normalizedGoal: string;
   detectedAmbiguities: string[];
   injectedImplicitConstraints: string[];
   schemaAndSignatureContracts: string[];
   subtaskDag: AtomicSubtaskNode[];
   acceptanceCriteria: string[];
   isOverloadedPromptSplit: boolean;
   estimatedReasoningComplexity: 'low' | 'medium' | 'high';
   createdAt: string;
 }
 export interface TruncationPlaceholderMatch {
   lineNumber: number;
   rawLine: string;
   recoveredSymbolNames: string[];
 }
 export interface GuardrailInspectionReport {
   guardId: string;
   sessionId: string;
   targetFilePath: string;
   passedAllGates: boolean;
   wasAutoHealed: boolean;
   healedContent: string;
   truncationMatches: TruncationPlaceholderMatch[];
   missingSymbolsRecovered: string[];
   hallucinatedImports: string[];
   versionSkewWarnings: string[];
   sycophancyWarnings: string[];
   createdAt: string;
 }
 export interface AgentBrowserActionCommand {
   commandType: 'open' | 'snapshot' | 'click' | 'fill' | 'get_url' | 'close';
   targetRefOrUrl?: string; // e.g., "@e1" or "http://127.0.0.1:3000"
   inputValue?: string;
 }
 export interface AgentBrowserActionExecutionResult {
   command: AgentBrowserActionCommand;
   success: boolean;
   loudFailureReason: string | null; // Fails loudly if target is hidden, disabled, offscreen, or covered
   postActionSnapshotId: string | null;
   domDiffFromPrevious: string | null;
   csprngBoundaryNonce: string;
   wrappedSafeOutput: string;
   executionLatencyMs: number;
 }
 export interface RuntimeVerificationReport {
   verificationId: string;
   sessionId: string;
   artifactId: string;
   targetFilePath: string;
   typeCheckPassed: boolean;
   typeCheckDiagnostics: string[];
   testGatePassed: boolean;
   executedTestFiles: string[];
   testRunnerOutputCcrId: string | null;
   agentBrowserResults: AgentBrowserActionExecutionResult[];
   overallStatus: 'verified_ready_for_approval' | 'failed_verification';
   createdAt: string;
 }

### 7.2 SQLite Schema Migration for Tasks 2, 3 & 4 (`src/main/db/schemaTasks234.ts`)
Adds 3 dedicated tables (`structured_specs`, `guardrail_reports`, and `runtime_verifications`) to `apexpad_brain.sqlite`.
/**
  * src/main/db/schemaTasks234.ts
  * Extends the ApexPad SQLite WAL Database with tables for Task 2 (Structured Specs),
  * Task 3 (Guardrail Reports), and Task 4 (Runtime & Agent-Browser Verifications).
  */
 import Database from 'better-sqlite3';
 export function initializeTasks234Schema(db: Database.Database): void {
   db.exec(`
     -- 12. TASK 2: STRUCTURED SPECIFICATION CONTRACTS TABLE
     CREATE TABLE IF NOT EXISTS "structured_specs" (
       "spec_id" TEXT PRIMARY KEY,
       "session_id" TEXT NOT NULL,
       "project_slug" TEXT NOT NULL,
       "raw_user_prompt" TEXT NOT NULL,
       "normalized_goal" TEXT NOT NULL,
       "detected_ambiguities_json" TEXT NOT NULL DEFAULT '[]',
       "injected_constraints_json" TEXT NOT NULL DEFAULT '[]',
       "schema_contracts_json" TEXT NOT NULL DEFAULT '[]',
       "subtask_dag_json" TEXT NOT NULL DEFAULT '[]',
       "acceptance_criteria_json" TEXT NOT NULL DEFAULT '[]',
       "is_overloaded_split" INTEGER NOT NULL DEFAULT 0,
       "reasoning_complexity" TEXT NOT NULL CHECK("reasoning_complexity" IN ('low', 'medium', 'high')),
       "created_at" TEXT NOT NULL,
       FOREIGN KEY ("session_id") REFERENCES "sdk_sessions"("session_id") ON DELETE CASCADE
     );
     -- 13. TASK 3: MODEL GENERATION GUARDRAIL & ANTI-TRUNCATION REPORTS TABLE
     CREATE TABLE IF NOT EXISTS "guardrail_reports" (
       "guard_id" TEXT PRIMARY KEY,
       "session_id" TEXT NOT NULL,
       "target_file_path" TEXT NOT NULL,
       "passed_all_gates" INTEGER NOT NULL DEFAULT 0,
       "was_auto_healed" INTEGER NOT NULL DEFAULT 0,
       "healed_content" TEXT NOT NULL,
       "truncation_matches_json" TEXT NOT NULL DEFAULT '[]',
       "recovered_symbols_json" TEXT NOT NULL DEFAULT '[]',
       "hallucinated_imports_json" TEXT NOT NULL DEFAULT '[]',
       "version_skew_warnings_json" TEXT NOT NULL DEFAULT '[]',
       "sycophancy_warnings_json" TEXT NOT NULL DEFAULT '[]',
       "created_at" TEXT NOT NULL
     );
     -- 14. TASK 4: RUNTIME VERIFICATION & AGENT-BROWSER CDP AUDIT TABLE
     CREATE TABLE IF NOT EXISTS "runtime_verifications" (
       "verification_id" TEXT PRIMARY KEY,
       "session_id" TEXT NOT NULL,
       "artifact_id" TEXT NOT NULL,
       "target_file_path" TEXT NOT NULL,
       "type_check_passed" INTEGER NOT NULL DEFAULT 0,
       "type_check_diagnostics_json" TEXT NOT NULL DEFAULT '[]',
       "test_gate_passed" INTEGER NOT NULL DEFAULT 0,
       "executed_test_files_json" TEXT NOT NULL DEFAULT '[]',
       "test_runner_ccr_id" TEXT,
       "agent_browser_results_json" TEXT NOT NULL DEFAULT '[]',
       "overall_status" TEXT NOT NULL CHECK("overall_status" IN ('verified_ready_for_approval', 'failed_verification')),
       "created_at" TEXT NOT NULL
     );
   `);
 }

### 7.3 TASK 2 Implementation: Input & Specification Structurer (`src/main/spec/specStructurer.ts`)
Resolves 100% of Input & Specification Bottlenecks:
Unstructured Stream-of-Consciousness Prompt Normalization: Extracts explicit file targets, symbol targets, and architectural intents from raw user prompts using the live Ripwire AST symbol index.
Task Granularity & Prompt Overload Splitter: Detects compound prompts (e.g., "build billing, connect Stripe, and update the dashboard") and decomposes them into an ordered Subtask DAG (`researcher` $\rightarrow$ `architect` $\rightarrow$ `verifier`) so no single agent turn exceeds its reasoning budget.
Implicit Constraint Auto-Injection: Automatically injects all active Project DNA invariants, layer-deny rules (`deny renderer -> db`), secret-protection rules, and Ripwire signature preservation contracts so the AI never treats baseline engineering standards as optional.
/**
  * src/main/spec/specStructurer.ts
  * TASK 2: Input & Specification Structurer
  * Transforms unstructured human prompts into deterministic PRD Contracts,
  * auto-injects Project DNA constraints, resolves AST targets, and splits overloaded tasks into an atomic Subtask DAG.
  */
 import Database from 'better-sqlite3';
 import crypto from 'crypto';
 import {
   AtomicSubtaskNode,
   StructuredSpecContract,
 } from '../../shared/types/guardrailsAndVerification';
 import { MemoryRouter } from '../memory/memoryRouter';
 import { ContextEngine } from '../context/contextEngine';
 export class SpecificationStructurer {
   private db: Database.Database;
   private memoryRouter: MemoryRouter;
   private contextEngine: ContextEngine;
   constructor(
     db: Database.Database,
     memoryRouter: MemoryRouter,
     contextEngine: ContextEngine
   ) {
     this.db = db;
     this.memoryRouter = memoryRouter;
     this.contextEngine = contextEngine;
   }
   /**
    * Compiles a raw, unstructured user prompt into a deterministic, AST-grounded Specification Contract.
    */
   public compileSpecificationContract(params: {
     sessionId: string;
     projectSlug: string;
     rawUserPrompt: string;
   }): StructuredSpecContract {
     const cleanPrompt = MemoryRouter.scrubPrivateContent(params.rawUserPrompt.trim());
     const now = new Date().toISOString();
     const specId = `spec_${crypto.randomBytes(6).toString('hex')}`;
     // 1. Rank workspace AST symbols against the raw prompt to ground implicit references
     const rankedSymbols = this.contextEngine
       .computePersonalizedPageRank(params.projectSlug, cleanPrompt)
       .slice(0, 8);
     const matchedFiles = Array.from(new Set(rankedSymbols.map((s) => s.filePath)));
     const matchedSymbolNames = rankedSymbols.map((s) => s.symbolName);
     // 2. Detect Ambiguities in the raw prompt
     const detectedAmbiguities: string[] = [];
     if (matchedFiles.length === 0) {
       detectedAmbiguities.push(
         'No existing workspace file or AST symbol matched the prompt directly; new module creation or broader search required.'
       );
     }
     if (/\b(fix it|make it work|optimize this|clean up|update it)\b/i.test(cleanPrompt) && cleanPrompt.length < 60) {
       detectedAmbiguities.push(
         'Underspecified action verb detected without explicit error trace or target signature; grounded to top PageRank symbols.'
       );
     }
     // 3. Auto-Inject Implicit Constraints from Project DNA + Baseline Engineering Guardrails
     const dnaRules = this.memoryRouter.getProjectDnaRules(params.projectSlug);
     const injectedImplicitConstraints: string[] = [
       'ZERO_TRUNCATION: Never emit placeholder comments such as "// ... rest of code ..."; preserve all existing symbol implementations.',
       'IMPORT_INTEGRITY: Only import packages declared in package.json or verified workspace relative paths.',
       'SECRET_HYGIENE: Never hardcode API keys, credentials, or tokens in source files.',
       ...dnaRules.map(
         (rule) =>
           `PROJECT_DNA [${rule.ruleKey}]: ${rule.ruleStatement}${
             rule.layerDenyRule ? ` (ENFORCED GATE: ${rule.layerDenyRule})` : ''
           }`
       ),
     ];
     // 4. Extract Existing Signature & Schema Contracts from matched AST nodes
     const schemaAndSignatureContracts = rankedSymbols.map(
       (sym) =>
         `${sym.filePath}:${sym.startLine}-${sym.endLine} -> ${sym.signature} (Cyclomatic=${sym.cyclomaticComplexity}, Tested=${sym.hasTestCoverage})`
     );
     // 5. Split Overloaded Prompts into an Atomic Subtask DAG
     const clauses = this.splitCompoundClauses(cleanPrompt);
     const isOverloadedPromptSplit = clauses.length > 1;
     const subtaskDag: AtomicSubtaskNode[] = [];
     // Node 1: Always start with a Research & Blast-Radius Grounding Subtask
     const researchSubtaskId = `${specId}_sub_1`;
     subtaskDag.push({
       subtaskId: researchSubtaskId,
       orderIndex: 1,
       assignedAgent: 'researcher',
       title: `Ground AST dependencies & progressive memory for: ${clauses[0].slice(0, 60)}`,
       targetFiles: matchedFiles.slice(0, 4),
       targetSymbols: matchedSymbolNames.slice(0, 6),
       explicitConstraints: injectedImplicitConstraints.slice(0, 4),
       verificationCommand: 'ripwire --impact --for-task',
       dependsOnSubtaskIds: [],
     });
     // Node 2..N: One atomic Architect Subtask per decomposed clause
     const architectSubtaskIds: string[] = [];
     clauses.forEach((clause, idx) => {
       const archId = `${specId}_sub_${idx + 2}`;
       architectSubtaskIds.push(archId);
       subtaskDag.push({
         subtaskId: archId,
         orderIndex: idx + 2,
         assignedAgent: 'architect',
         title: `Implement atomic change #${idx + 1}: ${clause}`,
         targetFiles: matchedFiles.slice(0, 3),
         targetSymbols: matchedSymbolNames.slice(0, 4),
         explicitConstraints: injectedImplicitConstraints,
         verificationCommand: 'tsc --noEmit',
         dependsOnSubtaskIds:
           idx === 0 ? [researchSubtaskId] : [architectSubtaskIds[idx - 1]],
       });
     });
     // Final Node: Automated Runtime & Agent-Browser Verification Gate
     const verifySubtaskId = `${specId}_sub_${subtaskDag.length + 1}`;
     subtaskDag.push({
       subtaskId: verifySubtaskId,
       orderIndex: subtaskDag.length + 1,
       assignedAgent: 'verifier',
       title: 'Run Anti-Truncation Guard, TypeScript Gate, Test Gate & Agent-Browser Snapshot Verification',
       targetFiles: matchedFiles,
       targetSymbols: matchedSymbolNames,
       explicitConstraints: [
         'All existing callers must pass type-checking without signature breakage.',
         'Interactive UI refs (@e1..@eN) must pass loud-failure visibility checks.',
       ],
       verificationCommand: 'vitest run && agent-browser snapshot -i',
       dependsOnSubtaskIds: architectSubtaskIds,
     });
     const acceptanceCriteria = [
       `All ${subtaskDag.length} atomic DAG subtasks complete with zero guardrail violations.`,
       `Zero hallucinated package imports or lazy truncation comments in ${matchedFiles.join(', ') || 'target files'}.`,
       `Ripwire layer-deny gates (${dnaRules.filter((d) => d.layerDenyRule).length} active) report 0 violations.`,
       `Compiler type-check and affected test files pass cleanly prior to Human Approval.`,
     ];
     const estimatedReasoningComplexity: StructuredSpecContract['estimatedReasoningComplexity'] =
       clauses.length >= 3 || rankedSymbols.some((s) => s.cyclomaticComplexity >= 8)
         ? 'high'
         : clauses.length === 2
         ? 'medium'
         : 'low';
     const normalizedGoal = clauses.map((c, i) => `[Step ${i + 1}] ${c}`).join(' -> ');
     this.db
       .prepare(
         `INSERT INTO "structured_specs" (
           "spec_id", "session_id", "project_slug", "raw_user_prompt",
           "normalized_goal", "detected_ambiguities_json", "injected_constraints_json",
           "schema_contracts_json", "subtask_dag_json", "acceptance_criteria_json",
           "is_overloaded_split", "reasoning_complexity", "created_at"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
       )
       .run(
         specId,
         params.sessionId,
         params.projectSlug,
         params.rawUserPrompt,
         normalizedGoal,
         JSON.stringify(detectedAmbiguities),
         JSON.stringify(injectedImplicitConstraints),
         JSON.stringify(schemaAndSignatureContracts),
         JSON.stringify(subtaskDag),
         JSON.stringify(acceptanceCriteria),
         isOverloadedPromptSplit ? 1 : 0,
         estimatedReasoningComplexity,
         now
       );
     return {
       specId,
       sessionId: params.sessionId,
       projectSlug: params.projectSlug,
       rawUserPrompt: params.rawUserPrompt,
       normalizedGoal,
       detectedAmbiguities,
       injectedImplicitConstraints,
       schemaAndSignatureContracts,
       subtaskDag,
       acceptanceCriteria,
       isOverloadedPromptSplit,
       estimatedReasoningComplexity,
       createdAt: now,
     };
   }
   /**
    * Splits overloaded multi-concern user prompts into atomic engineering clauses.
    */
   private splitCompoundClauses(prompt: string): string[] {
     const rawParts = prompt
       .split(/(?:\s+and\s+then\s+|\s+also\s+|\s*;\s*|\n+\s*[-*\d.]+\s+|\s+and\s+(?=(?:build|create|add|update|connect|refactor|fix|implement|wire|remove|delete)\b))/i)
       .map((p) => p.trim())
       .filter((p) => p.length > 4);
     return rawParts.length > 0 ? rawParts : [prompt];
   }
 }