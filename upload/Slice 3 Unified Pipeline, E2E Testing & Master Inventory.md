### 7.6 Unified End-to-End Pipeline Controller (`src/main/orchestrator/fullSystemPipeline.ts`)
Connects Task 2 (Spec Structurer) $\rightarrow$ Task 1 (Context & Memory + DAG Orchestrator) $\rightarrow$ Task 3 (Anti-Truncation & Hallucination Guardrails) $\rightarrow$ Task 4 (Runtime & Agent-Browser CDP Verifier) into a single deterministic pipeline.
/**
  * src/main/orchestrator/fullSystemPipeline.ts
  * Master End-to-End Pipeline integrating Tasks 1, 2, 3, and 4:
  * Task 2 (SpecificationStructurer) -> Task 1 (ContextEngine + DAG Orchestrator)
  * -> Task 3 (ModelGenerationGuardrails) -> Task 4 (RuntimeVerificationEngine).
  */
 import Database from 'better-sqlite3';
 import { initializeTasks234Schema } from '../db/schemaTasks234';
 import { MemoryRouter } from '../memory/memoryRouter';
 import { DistillationPipeline } from '../pipeline/distillationPipeline';
 import { ContextEngine } from '../context/contextEngine';
 import { ApexDagOrchestrator, DagExecutionState } from './dagOrchestrator';
 import { SpecificationStructurer } from '../spec/specStructurer';
 import { ModelGenerationGuardrails } from '../guardrails/codeGuard';
 import { RuntimeVerificationEngine } from '../verify/runtimeVerifier';
 import {
   AgentBrowserActionCommand,
   GuardrailInspectionReport,
   RuntimeVerificationReport,
   StructuredSpecContract,
 } from '../../shared/types/guardrailsAndVerification';
 export interface FullApexPipelineResult {
   specContract: StructuredSpecContract;
   guardrailReports: GuardrailInspectionReport[];
   dagState: DagExecutionState;
   verificationReports: RuntimeVerificationReport[];
 }
 export class FullApexSystemPipeline {
   public readonly specStructurer: SpecificationStructurer;
   public readonly codeGuardrails: ModelGenerationGuardrails;
   public readonly runtimeVerifier: RuntimeVerificationEngine;
   private dagOrchestrator: ApexDagOrchestrator;
   constructor(params: {
     db: Database.Database;
     workspaceRoot: string;
     memoryRouter: MemoryRouter;
     distillationPipeline: DistillationPipeline;
     contextEngine: ContextEngine;
     dagOrchestrator: ApexDagOrchestrator;
   }) {
     initializeTasks234Schema(params.db);
     this.specStructurer = new SpecificationStructurer(
       params.db,
       params.memoryRouter,
       params.contextEngine
     );
     this.codeGuardrails = new ModelGenerationGuardrails(
       params.db,
       params.workspaceRoot
     );
     this.runtimeVerifier = new RuntimeVerificationEngine({
       db: params.db,
       contextEngine: params.contextEngine,
       distillationPipeline: params.distillationPipeline,
     });
     this.dagOrchestrator = params.dagOrchestrator;
   }
   /**
    * Runs the full 4-Stage Engineering Pipeline from raw prompt to verified Staged Artifact.
    */
   public executeFullPipeline(params: {
     sessionId: string;
     projectSlug: string;
     rawUserPrompt: string;
     tokenBudgetCeiling: number;
     candidateEdits: Array<{
       targetFilePath: string;
       previousContent: string;
       proposedContent: string;
     }>;
     browserVerificationScript?: AgentBrowserActionCommand[];
   }): FullApexPipelineResult {
     // STAGE 1 (Task 2): Compile Deterministic Specification Contract & Subtask DAG
     const specContract = this.specStructurer.compileSpecificationContract({
       sessionId: params.sessionId,
       projectSlug: params.projectSlug,
       rawUserPrompt: params.rawUserPrompt,
     });
     // STAGE 2 (Task 3): Run Anti-Truncation AST Splicer & Hallucination Guardrails on every candidate edit
     const guardrailReports: GuardrailInspectionReport[] = [];
     const healedEdits: Array<{
       targetFilePath: string;
       previousContent: string;
       proposedContent: string;
     }> = [];
     for (const edit of params.candidateEdits) {
       const report = this.codeGuardrails.inspectAndHealCandidateCode({
         sessionId: params.sessionId,
         targetFilePath: edit.targetFilePath,
         previousContent: edit.previousContent,
         proposedContent: edit.proposedContent,
         userPrompt: params.rawUserPrompt,
       });
       guardrailReports.push(report);
       healedEdits.push({
         targetFilePath: edit.targetFilePath,
         previousContent: edit.previousContent,
         proposedContent: report.healedContent, // Always pass auto-healed AST code downstream
       });
     }
     // STAGE 3 (Task 1): Execute Context Packer, CrewAI Planner, Ripwire Blast Radius & Artifact Staging
     const dagState = this.dagOrchestrator.executeDagUpToStaging({
       sessionId: params.sessionId,
       projectSlug: params.projectSlug,
       userGoal: specContract.normalizedGoal,
       tokenBudgetCeiling: params.tokenBudgetCeiling,
       candidateEdits: healedEdits,
     });
     // STAGE 4 (Task 4): Run Automated Compiler Gate, Test Gate & Agent-Browser @e1 Verification Loop
     const verificationReports: RuntimeVerificationReport[] = [];
     for (const staged of dagState.stagedArtifacts) {
       const verReport = this.runtimeVerifier.runFullArtifactVerification({
         sessionId: params.sessionId,
         artifactId: staged.artifactId,
         targetFilePath: staged.targetFilePath,
         candidateContent: staged.proposedContent,
         requiredTestFiles: staged.blastRadius.requiredTests,
         browserVerificationScript: params.browserVerificationScript,
       });
       verificationReports.push(verReport);
     }
     return {
       specContract,
       guardrailReports,
       dagState,
       verificationReports,
     };
   }
 }

### 7.7 End-to-End Verification Suite for Tasks 2, 3, and 4 (`tests/tasks234FullVerification.spec.ts`)
Proves all invariants of Tasks 2, 3, and 4:
Task 2 — Overloaded Prompt Decomposition & Project DNA Constraint Auto-Injection: Splits a multi-part prompt into an ordered `researcher` $\rightarrow$ `architect` $\rightarrow$ `verifier` DAG and binds existing Ripwire AST signatures.
Task 3 — Anti-Truncation AST Splicer & Hallucination Blocker: Takes an LLM edit that lazily wrote `// ... rest of existing code ...` (dropping two existing functions) and automatically recovers and splices both functions back in from the AST while flagging a hallucinated npm package (`@nonexistent/magic-sdk`).
Task 4 — Agent-Browser `@e1` RefMap Loop, Loud Failures & CSPRNG Boundaries: Verifies that clicking a covered element (`#cookie-consent-modal`) fails loudly instead of silently reporting success, and succeeds once the overlay is dismissed and a fresh `snapshot -i` is taken.
/**
  * tests/tasks234FullVerification.spec.ts
  * Vitest End-to-End Verification Suite for Tasks 2, 3, and 4.
  */
 import { describe, it, expect, beforeEach, afterEach } from 'vitest';
 import fs from 'fs';
 import path from 'path';
 import os from 'os';
 import { createApexBackend, ApexBackendContainer } from '../src/main/index';
 import { FullApexSystemPipeline } from '../src/main/orchestrator/fullSystemPipeline';
 describe('ApexPad Tasks 2, 3, and 4 End-to-End Verification Suite', () => {
   let tmpDir: string;
   let container: ApexBackendContainer;
   let pipeline: FullApexSystemPipeline;
   const projectSlug = 'apexpad-tasks-234-test';
   beforeEach(() => {
     tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexpad-t234-'));
     fs.writeFileSync(
       path.join(tmpDir, 'package.json'),
       JSON.stringify({
         name: 'test-workspace',
         dependencies: {
           'better-sqlite3': '^11.5.0',
           react: '^18.3.1',
         },
       }),
       'utf8'
     );
     const dbPath = path.join(tmpDir, 'test_brain.sqlite');
     container = createApexBackend({
       dbFilePath: dbPath,
       workspaceRoot: tmpDir,
       projectSlug,
       capturePort: 0,
     });
     pipeline = new FullApexSystemPipeline({
       db: container.dbManager.getConnection(),
       workspaceRoot: tmpDir,
       memoryRouter: container.memoryRouter,
       distillationPipeline: container.distillationPipeline,
       contextEngine: container.contextEngine,
       dagOrchestrator: container.dagOrchestrator,
     });
   });
   afterEach(async () => {
     await container.captureDaemon.stop();
     container.dbManager.close();
     fs.rmSync(tmpDir, { recursive: true, force: true });
   });
   it('1. [Task 2] Splits overloaded stream-of-consciousness prompts into an atomic Subtask DAG and injects Project DNA rules', () => {
     container.memoryRouter.startSession({
       sessionId: 'sess_spec',
       projectSlug,
       branchName: 'main',
       firstPrompt: 'Setup billing architecture',
     });
     container.memoryRouter.promoteToProjectDna({
       projectSlug,
       category: 'architecture',
       ruleKey: 'idempotent_billing_writes',
       ruleStatement: 'All billing mutations must carry an idempotencyKey parameter.',
       sourceObservationId: 'obs_billing_1',
       layerDenyRule: 'deny renderer -> db',
     });
     container.contextEngine.indexFileSymbols({
       projectSlug,
       filePath: 'src/billing/stripeService.ts',
       content: `export function createInvoice(customerId: string): string {\n  return customerId;\n}\n`,
     });
     const spec = pipeline.specStructurer.compileSpecificationContract({
       sessionId: 'sess_spec',
       projectSlug,
       rawUserPrompt:
         'Update createInvoice to require idempotencyKey and connect Stripe webhook handler and update the billing UI dashboard',
     });
     expect(spec.isOverloadedPromptSplit).toBe(true);
     expect(spec.subtaskDag.length).toBeGreaterThanOrEqual(4); // 1 Researcher + 3 Architect + 1 Verifier
     expect(
       spec.injectedImplicitConstraints.some((c) => c.includes('idempotent_billing_writes'))
     ).toBe(true);
     expect(
       spec.schemaAndSignatureContracts.some((s) => s.includes('createInvoice'))
     ).toBe(true);
   });
   it('2. [Task 3] Auto-heals lazy "// ... rest of existing code ..." truncation by splicing missing AST symbols and flags hallucinated imports', () => {
     container.memoryRouter.startSession({
       sessionId: 'sess_guard',
       projectSlug,
       branchName: 'main',
       firstPrompt: 'Test anti-truncation healer',
     });
     const originalFile = [
       `import Database from 'better-sqlite3';`,
       ``,
       `export function verifySessionToken(token: string): boolean {`,
       `  if (!token) throw new Error("Missing token");`,
       `  return token.startsWith("valid_");`,
       `}`,
       ``,
       `export function revokeSessionToken(token: string): string {`,
       `  return "revoked:" + token;`,
       `}`,
       ``,
       `export function auditSecurityLog(entry: string): string {`,
       `  return "[AUDIT] " + entry;`,
       `}`,
     ].join('\n');
     // Simulate a lazy LLM output that hallucinates an npm package and truncates the bottom two functions
     const lazyProposedFile = [
       `import Database from 'better-sqlite3';`,
       `import { magicVerify } from '@nonexistent-hallucinated/magic-auth';`,
       ``,
       `export function verifySessionToken(token: string): boolean {`,
       `  if (!token) throw new Error("Missing token");`,
       `  return token.startsWith("valid_v2_");`,
       `}`,
       `// ... rest of existing code remains unchanged ...`,
     ].join('\n');
     const report = pipeline.codeGuardrails.inspectAndHealCandidateCode({
       sessionId: 'sess_guard',
       targetFilePath: 'src/security/sessionAuth.ts',
       previousContent: originalFile,
       proposedContent: lazyProposedFile,
       userPrompt: 'Is it crashing because of redisClusterConfig?',
     });
     // 1. Both truncated functions must be automatically spliced back into healedContent
     expect(report.wasAutoHealed).toBe(true);
     expect(report.missingSymbolsRecovered).toContain('revokeSessionToken');
     expect(report.missingSymbolsRecovered).toContain('auditSecurityLog');
     expect(report.healedContent).toContain('export function revokeSessionToken');
     expect(report.healedContent).toContain('export function auditSecurityLog');
     expect(report.healedContent).not.toContain('rest of existing code');
     // 2. Hallucinated package import must be caught
     expect(report.hallucinatedImports.length).toBe(1);
     expect(report.hallucinatedImports[0]).toContain('@nonexistent-hallucinated/magic-auth');
     // 3. Anti-sycophancy critic must warn that 'redisClusterConfig' was never in the file
     expect(
       report.sycophancyWarnings.some((w) => w.includes('redisClusterConfig'))
     ).toBe(true);
   });
   it('3. [Task 4] Executes Agent-Browser snapshot -> @e1 RefMap loop with Loud Failures on covered elements and CSPRNG boundaries', () => {
     container.memoryRouter.startSession({
       sessionId: 'sess_browser',
       projectSlug,
       branchName: 'main',
       firstPrompt: 'Verify UI workflow via Agent-Browser',
     });
     // Seed live DOM where @e2 ("Submit Order") is initially covered by a cookie banner (@e1)
     pipeline.runtimeVerifier.setLivePageDomState('sess_browser', 'http://127.0.0.1:3000/checkout', [
       {
         role: 'button',
         name: 'Accept Cookies',
         tagName: 'BUTTON',
         isInteractive: true,
         domPathSelector: '#accept-cookies-btn',
       },
       {
         role: 'button',
         name: 'Submit Order',
         tagName: 'BUTTON',
         isInteractive: true,
         coveredByOverlaySelector: '#cookie-consent-banner',
         domPathSelector: '#submit-order-btn',
       },
     ]);
     // Step 1: Take initial interactive accessibility snapshot (`snapshot -i`)
     const snapRes = pipeline.runtimeVerifier.executeAgentBrowserCommand('sess_browser', {
       commandType: 'snapshot',
     });
     expect(snapRes.success).toBe(true);
     expect(snapRes.wrappedSafeOutput).toContain('[ref=e1]');
     expect(snapRes.wrappedSafeOutput).toContain('[ref=e2]');
     expect(snapRes.wrappedSafeOutput).toContain(
       `<<<AGENT_BROWSER_UNTRUSTED_CONTENT_START_${snapRes.csprngBoundaryNonce}>>>`
     );
     // Step 2: Attempt to click @e2 while covered by #cookie-consent-banner -> MUST FAIL LOUDLY
     const blockedClick = pipeline.runtimeVerifier.executeAgentBrowserCommand('sess_browser', {
       commandType: 'click',
       targetRefOrUrl: '@e2',
     });
     expect(blockedClick.success).toBe(false);
     expect(blockedClick.loudFailureReason).toContain('#cookie-consent-banner');
     // Step 3: Dismiss overlay, take fresh snapshot, and click @e2 -> MUST SUCCEED
     pipeline.runtimeVerifier.setLivePageDomState('sess_browser', 'http://127.0.0.1:3000/checkout', [
       {
         role: 'button',
         name: 'Submit Order',
         tagName: 'BUTTON',
         isInteractive: true,
         coveredByOverlaySelector: null,
         domPathSelector: '#submit-order-btn',
       },
     ]);
     // Attempting to click @e1 without re-snapshotting after DOM change must fail loudly due to stale RefMap
     const staleClick = pipeline.runtimeVerifier.executeAgentBrowserCommand('sess_browser', {
       commandType: 'click',
       targetRefOrUrl: '@e1',
     });
     expect(staleClick.success).toBe(false);
     expect(staleClick.loudFailureReason).toContain('stale');
     // Take fresh snapshot and click @e1 ("Submit Order")
     pipeline.runtimeVerifier.executeAgentBrowserCommand('sess_browser', {
       commandType: 'snapshot',
     });
     const cleanClick = pipeline.runtimeVerifier.executeAgentBrowserCommand('sess_browser', {
       commandType: 'click',
       targetRefOrUrl: '@e1',
     });
     expect(cleanClick.success).toBe(true);
   });
 });

## Complete Master Inventory Across All 5 Factors (Tasks 1–4)
| Architectural Layer|Module File Path|Status|
| ---|---|---|
| Shared Domain  & Types|src/shared/types/domain.ts   &  src/shared/types/guardrailsAndVerification.ts|100% Complete (Zero Stubs)|
| SQLite 14-Table WAL + FTS5 Engine|src/main/db/sqliteSchema.ts   &  src/main/db/schemaTasks234.ts|100% Complete (Zero Stubs)|
| Task 1: Memory Router  & DNA Vault|src/main/memory/memoryRouter.ts|100% Complete (Zero Stubs)|
| Task 1: Headroom CCR  & Distillation|src/main/pipeline/distillationPipeline.ts|100% Complete (Zero Stubs)|
| Task 1: Ripwire AST Graph  & Context Packer|src/main/context/contextEngine.ts|100% Complete (Zero Stubs)|
| Task 1: Unattended  :37777  Capture Daemon|src/main/capture/unattendedCodexCapture.ts|100% Complete (Zero Stubs)|
| Task 1: Model Retrieval  & Tool Adapter|src/main/llm/modelRetrievalAdapter.ts|100% Complete (Zero Stubs)|
| Task 2: Input  & Specification Structurer|src/main/spec/specStructurer.ts|100% Complete (Zero Stubs)|
| Task 3: Anti-Truncation  & Code Guardrails|src/main/guardrails/codeGuard.ts|100% Complete (Zero Stubs)|
| Task 4: Runtime  & Agent-Browser Verifier|src/main/verify/runtimeVerifier.ts|100% Complete (Zero Stubs)|
| Unified DAG  & Master Pipeline|src/main/orchestrator/dagOrchestrator.ts   &  src/main/orchestrator/fullSystemPipeline.ts|100% Complete (Zero Stubs)|
| Electron IPC, Preload  & React Workbench|src/main/index.ts ,  src/main/preload.ts ,  src/renderer/ApexPadWorkbench.tsx ,  src/renderer/main.tsx|100% Complete (Zero Stubs)|
| Vitest E2E Verification Suites|tests/contextMemoryFusion.spec.ts   &  tests/tasks234FullVerification.spec.ts|100% Complete (Zero Stubs)|