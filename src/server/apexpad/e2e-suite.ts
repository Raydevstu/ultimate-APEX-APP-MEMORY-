/**
 * src/server/apexpad/e2e-suite.ts
 * §7.7 End-to-End Verification Suite for Tasks 2, 3, and 4.
 *
 * The Electron blueprint ships this suite as a Vitest spec; in the Next.js
 * workbench it is a first-class runtime feature: the exact same behavioral
 * invariants are executed live against the engine and surfaced in the
 * VERIFIER panel, producing per-assertion pass/fail evidence.
 *
 * Invariants proven (blueprint §7.7):
 *   Scenario 1 — Task 2: splits an overloaded stream-of-consciousness prompt
 *     into an ordered researcher -> architect -> verifier DAG and injects
 *     existing Project DNA constraints + Ripwire AST signature contracts.
 *   Scenario 2 — Task 3: auto-heals a lazy "// ... rest of existing code ..."
 *     edit by splicing both dropped AST symbols back in from the previous file
 *     version while flagging the hallucinated npm package and the unverified
 *     user premise (anti-sycophancy).
 *   Scenario 3 — Task 4: the Agent-Browser snapshot -> @e1 RefMap loop fails
 *     LOUDLY on an element covered by an overlay and on a stale RefMap, wraps
 *     untrusted DOM text in CSPRNG nonce boundaries, and succeeds once the
 *     overlay is dismissed and a fresh snapshot -i is taken.
 *
 * All state is written under the isolated project slug `apexpad-tasks-234-test`
 * (matching the blueprint's own test project), so the suite never pollutes the
 * live workbench project.
 */

import crypto from 'crypto';
import fs from 'fs';
import { db } from '@/lib/db';
import { publishCaptureEvent } from './event-bus';
import { MemoryRouter } from './memory-router';
import { DistillationPipeline } from './distillation-pipeline';
import { ContextEngine } from './context-engine';
import { ApexDagOrchestrator } from './dag-orchestrator';
import { FullApexSystemPipeline } from './full-pipeline';
import { resolveSafeWorkspacePath } from './workspace';
import { SpecificationStructurer } from './spec-structurer';
import { ModelGenerationGuardrails } from './guardrails';
import { RuntimeVerificationEngine } from './runtime-verifier';

export const E2E_SUITE_PROJECT_SLUG = 'apexpad-tasks-234-test';

export interface E2eAssertion {
  name: string;
  passed: boolean;
  evidence: string;
}

export interface E2eScenarioReport {
  scenarioId: string;
  title: string;
  passed: boolean;
  assertions: E2eAssertion[];
  durationMs: number;
}

export interface E2eSuiteRunReport {
  runId: string;
  projectSlug: string;
  startedAt: string;
  durationMs: number;
  scenarios: E2eScenarioReport[];
  allPassed: boolean;
}

export class ApexE2eVerificationSuite {
  private memoryRouter: MemoryRouter;
  private contextEngine: ContextEngine;
  private distillationPipeline: DistillationPipeline;
  private specStructurer: SpecificationStructurer;
  private codeGuardrails: ModelGenerationGuardrails;
  private runtimeVerifier: RuntimeVerificationEngine;
  private dagOrchestrator: ApexDagOrchestrator;
  private fullPipeline: FullApexSystemPipeline | null;

  constructor(params: {
    memoryRouter: MemoryRouter;
    contextEngine: ContextEngine;
    distillationPipeline: DistillationPipeline;
    specStructurer: SpecificationStructurer;
    codeGuardrails: ModelGenerationGuardrails;
    runtimeVerifier: RuntimeVerificationEngine;
    dagOrchestrator?: ApexDagOrchestrator;
    fullPipeline?: FullApexSystemPipeline;
  }) {
    this.memoryRouter = params.memoryRouter;
    this.contextEngine = params.contextEngine;
    this.distillationPipeline = params.distillationPipeline;
    this.specStructurer = params.specStructurer;
    this.codeGuardrails = params.codeGuardrails;
    this.runtimeVerifier = params.runtimeVerifier;
    this.dagOrchestrator = params.dagOrchestrator as ApexDagOrchestrator;
    this.fullPipeline = params.fullPipeline ?? null;
  }

  public async runFullSuite(): Promise<E2eSuiteRunReport> {
    const runId = `e2e_${crypto.randomBytes(6).toString('hex')}`;
    const startedAt = new Date().toISOString();
    const suiteStart = Date.now();

    const scenarios: E2eScenarioReport[] = [];
    scenarios.push(await this.runScenario1SpecStructurer(runId));
    scenarios.push(await this.runScenario2Guardrails());
    scenarios.push(await this.runScenario3AgentBrowser());
    if (this.dagOrchestrator && this.fullPipeline) {
      scenarios.push(await this.runScenario4ProductionWiring());
    }

    const report: E2eSuiteRunReport = {
      runId,
      projectSlug: E2E_SUITE_PROJECT_SLUG,
      startedAt,
      durationMs: Date.now() - suiteStart,
      scenarios,
      allPassed: scenarios.every((s) => s.passed),
    };

    // Audit the run as an observation inside the isolated suite project.
    try {
      await this.memoryRouter.recordObservation({
        sessionId: scenarios[0].scenarioId.replace('scenario1', 'sess_e2e'),
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        scope: 'repo',
        category: 'tool_trace',
        title: `E2E verification suite run ${runId}: ${report.allPassed ? 'ALL GREEN' : 'FAILURES PRESENT'}`,
        subtitle: `${scenarios.length} scenarios / ${report.scenarios.reduce((n, s) => n + s.assertions.length, 0)} assertions in ${report.durationMs}ms`,
        narrative: scenarios
          .map(
            (s) =>
              `${s.scenarioId}: ${s.passed ? 'PASS' : 'FAIL'} — ${s.assertions.filter((a) => a.passed).length}/${s.assertions.length} assertions (${s.durationMs}ms)`
          )
          .join(' | '),
        facts: scenarios.flatMap((s) =>
          s.assertions.filter((a) => !a.passed).map((a) => `${s.scenarioId}: ${a.name} — ${a.evidence}`)
        ),
        referencedFiles: [],
        referencedSymbols: [],
        gitBlobHashes: {},
      });
    } catch {
      // Observation audit is best-effort; assertion evidence is already returned.
    }

    publishCaptureEvent('e2e:suite', runId, E2E_SUITE_PROJECT_SLUG, {
      runId,
      allPassed: report.allPassed,
      scenarioCount: scenarios.length,
      assertionCount: scenarios.reduce((n, s) => n + s.assertions.length, 0),
      durationMs: report.durationMs,
    });

    return report;
  }

  /* ------------------------------------------------------------------ */
  /* Scenario 1 — Task 2: Spec Structurer                                */
  /* ------------------------------------------------------------------ */

  private async runScenario1SpecStructurer(runId: string): Promise<E2eScenarioReport> {
    const start = Date.now();
    const sessionId = `sess_e2e_spec_${crypto.randomBytes(3).toString('hex')}`;
    const assertions: E2eAssertion[] = [];

    try {
      await this.memoryRouter.startSession({
        sessionId,
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        branchName: 'main',
        firstPrompt: 'Setup billing architecture',
      });

      await this.memoryRouter.promoteToProjectDna({
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        category: 'architecture',
        ruleKey: 'idempotent_billing_writes',
        ruleStatement: 'All billing mutations must carry an idempotencyKey parameter.',
        sourceObservationId: `obs_billing_${runId}`,
        layerDenyRule: null,
      });

      await this.contextEngine.indexFileSymbols({
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        filePath: 'src/billing/stripeService.ts',
        content:
          'export function createInvoice(customerId: string): string {\n  return customerId;\n}\n',
      });

      const spec = await this.specStructurer.compileSpecificationContract({
        sessionId,
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        rawUserPrompt:
          'Update createInvoice to require idempotencyKey and connect Stripe webhook handler and update the billing UI dashboard',
      });

      assertions.push(
        {
          name: 'overloaded prompt split into an atomic Subtask DAG',
          passed: spec.isOverloadedPromptSplit === true,
          evidence: `isOverloadedPromptSplit=${spec.isOverloadedPromptSplit}; raw prompt split into ${spec.subtaskDag.length} nodes`,
        },
        {
          name: 'DAG length >= 4 (1 researcher + 3 architect + 1 verifier)',
          passed: spec.subtaskDag.length >= 4,
          evidence: `subtaskDag.length=${spec.subtaskDag.length} [${spec.subtaskDag.map((n) => `${n.orderIndex}:${n.assignedAgent}`).join(', ')}]`,
        },
        {
          name: 'Project DNA rule idempotent_billing_writes auto-injected as implicit constraint',
          passed: spec.injectedImplicitConstraints.some((c) => c.includes('idempotent_billing_writes')),
          evidence:
            spec.injectedImplicitConstraints.find((c) => c.includes('idempotent_billing_writes')) ??
            `no match in ${spec.injectedImplicitConstraints.length} injected constraints`,
        },
        {
          name: 'existing Ripwire signature contract bound (createInvoice)',
          passed: spec.schemaAndSignatureContracts.some((s) => s.includes('createInvoice')),
          evidence:
            spec.schemaAndSignatureContracts.find((s) => s.includes('createInvoice')) ??
            `no match in ${spec.schemaAndSignatureContracts.length} signature contracts`,
        }
      );
    } catch (err) {
      assertions.push({
        name: 'scenario execution completed without engine error',
        passed: false,
        evidence: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      scenarioId: 'scenario1_task2_spec_structurer',
      title: '[Task 2] Overloaded prompt decomposition + Project DNA constraint auto-injection',
      passed: assertions.every((a) => a.passed),
      assertions,
      durationMs: Date.now() - start,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Scenario 2 — Task 3: Anti-Truncation + Hallucination Guardrails     */
  /* ------------------------------------------------------------------ */

  private async runScenario2Guardrails(): Promise<E2eScenarioReport> {
    const start = Date.now();
    const sessionId = `sess_e2e_guard_${crypto.randomBytes(3).toString('hex')}`;
    const assertions: E2eAssertion[] = [];

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

    // Lazy LLM output: hallucinated npm package + the bottom two functions dropped.
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

    try {
      await this.memoryRouter.startSession({
        sessionId,
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        branchName: 'main',
        firstPrompt: 'Test anti-truncation healer',
      });

      const report = await this.codeGuardrails.inspectAndHealCandidateCode({
        sessionId,
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        targetFilePath: 'src/security/sessionAuth.ts',
        previousContent: originalFile,
        proposedContent: lazyProposedFile,
        userPrompt: 'Is it crashing because of redisClusterConfig?',
      });

      assertions.push(
        {
          name: 'lazy truncation placeholder detected and auto-healed',
          passed: report.wasAutoHealed === true,
          evidence: `wasAutoHealed=${report.wasAutoHealed}; placeholder at line ${report.truncationMatches.map((m) => m.lineNumber).join(', ') || 'none'}`,
        },
        {
          name: 'revokeSessionToken spliced back from previous-version AST',
          passed: report.missingSymbolsRecovered.includes('revokeSessionToken'),
          evidence: `recovered=[${report.missingSymbolsRecovered.join(', ')}]`,
        },
        {
          name: 'auditSecurityLog spliced back from previous-version AST',
          passed: report.missingSymbolsRecovered.includes('auditSecurityLog'),
          evidence: `recovered=[${report.missingSymbolsRecovered.join(', ')}]`,
        },
        {
          name: 'healed content contains both recovered export functions',
          passed:
            report.healedContent.includes('export function revokeSessionToken') &&
            report.healedContent.includes('export function auditSecurityLog'),
          evidence: `healed content has ${report.healedContent.split('\n').length} lines; both export signatures present=${report.healedContent.includes('export function revokeSessionToken') && report.healedContent.includes('export function auditSecurityLog')}`,
        },
        {
          name: 'no truncation placeholder survives in healed content',
          passed: !report.healedContent.includes('rest of existing code'),
          evidence: `healedContent contains placeholder text: ${report.healedContent.includes('rest of existing code')}`,
        },
        {
          name: 'exactly one hallucinated npm import caught',
          passed: report.hallucinatedImports.length === 1,
          evidence: `hallucinatedImports=[${report.hallucinatedImports.join(' | ')}]`,
        },
        {
          name: 'hallucinated specifier @nonexistent-hallucinated/magic-auth identified',
          passed: report.hallucinatedImports[0]?.includes('@nonexistent-hallucinated/magic-auth') === true,
          evidence: report.hallucinatedImports[0] ?? 'no hallucinated import recorded',
        },
        {
          name: 'anti-sycophancy critic rejects the redisClusterConfig premise',
          passed: report.sycophancyWarnings.some((w) => w.includes('redisClusterConfig')),
          evidence:
            report.sycophancyWarnings.find((w) => w.includes('redisClusterConfig')) ??
            `warnings=[${report.sycophancyWarnings.join(' | ')}]`,
        }
      );
    } catch (err) {
      assertions.push({
        name: 'scenario execution completed without engine error',
        passed: false,
        evidence: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      scenarioId: 'scenario2_task3_guardrails',
      title: '[Task 3] Anti-truncation AST splicer + hallucinated import blocker + premise critic',
      passed: assertions.every((a) => a.passed),
      assertions,
      durationMs: Date.now() - start,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Scenario 3 — Task 4: Agent-Browser @e1 RefMap loop                  */
  /* ------------------------------------------------------------------ */

  private async runScenario3AgentBrowser(): Promise<E2eScenarioReport> {
    const start = Date.now();
    const sessionId = `sess_e2e_browser_${crypto.randomBytes(3).toString('hex')}`;
    const assertions: E2eAssertion[] = [];

    try {
      await this.memoryRouter.startSession({
        sessionId,
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        branchName: 'main',
        firstPrompt: 'Verify UI workflow via Agent-Browser',
      });

      // Seed live DOM where @e2 ("Submit Order") is covered by the cookie banner.
      this.runtimeVerifier.setLivePageDomState({
        sessionId,
        url: 'http://127.0.0.1:3000/checkout',
        elements: [
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
        ],
      });

      // Step 1: initial interactive accessibility snapshot (`snapshot -i`).
      const snapRes = await this.runtimeVerifier.executeAgentBrowserCommand(sessionId, {
        commandType: 'snapshot',
      });
      assertions.push(
        {
          name: 'snapshot -i succeeds against the live DOM registry',
          passed: snapRes.success === true,
          evidence: `snapshot executed in ${snapRes.executionLatencyMs}ms`,
        },
        {
          name: 'wrapped output carries [ref=e1] and [ref=e2]',
          passed: snapRes.wrappedSafeOutput.includes('[ref=e1]') && snapRes.wrappedSafeOutput.includes('[ref=e2]'),
          evidence: snapRes.wrappedSafeOutput.split('\n').slice(3, 6).join(' / '),
        },
        {
          name: 'untrusted DOM text framed by the CSPRNG nonce boundary',
          passed: snapRes.wrappedSafeOutput.includes(
            `<<<AGENT_BROWSER_UNTRUSTED_CONTENT_START_${snapRes.csprngBoundaryNonce}>>>`
          ),
          evidence: `nonce=${snapRes.csprngBoundaryNonce} (${snapRes.csprngBoundaryNonce.length * 4} bits CSPRNG)`,
        }
      );

      // Step 2: click @e2 while covered -> MUST FAIL LOUDLY.
      const blockedClick = await this.runtimeVerifier.executeAgentBrowserCommand(sessionId, {
        commandType: 'click',
        targetRefOrUrl: '@e2',
      });
      assertions.push(
        {
          name: 'click on covered @e2 fails loudly',
          passed: blockedClick.success === false,
          evidence: blockedClick.loudFailureReason ?? 'unexpected success',
        },
        {
          name: 'failure reason names the covering overlay #cookie-consent-banner',
          passed: (blockedClick.loudFailureReason ?? '').includes('#cookie-consent-banner'),
          evidence: blockedClick.loudFailureReason ?? 'no failure reason recorded',
        }
      );

      // Step 3: dismiss overlay (DOM changes -> revision bump), stale click must fail.
      this.runtimeVerifier.setLivePageDomState({
        sessionId,
        url: 'http://127.0.0.1:3000/checkout',
        elements: [
          {
            role: 'button',
            name: 'Submit Order',
            tagName: 'BUTTON',
            isInteractive: true,
            coveredByOverlaySelector: null,
            domPathSelector: '#submit-order-btn',
          },
        ],
      });
      const staleClick = await this.runtimeVerifier.executeAgentBrowserCommand(sessionId, {
        commandType: 'click',
        targetRefOrUrl: '@e1',
      });
      assertions.push(
        {
          name: 'click @e1 without re-snapshotting after DOM change fails (stale RefMap)',
          passed: staleClick.success === false,
          evidence: staleClick.loudFailureReason ?? 'unexpected success',
        },
        {
          name: 'stale failure reason contains "stale"',
          passed: (staleClick.loudFailureReason ?? '').includes('stale'),
          evidence: staleClick.loudFailureReason ?? 'no failure reason recorded',
        }
      );

      // Step 4: fresh snapshot, then click @e1 -> MUST SUCCEED.
      await this.runtimeVerifier.executeAgentBrowserCommand(sessionId, { commandType: 'snapshot' });
      const cleanClick = await this.runtimeVerifier.executeAgentBrowserCommand(sessionId, {
        commandType: 'click',
        targetRefOrUrl: '@e1',
      });
      assertions.push(
        {
          name: 'click @e1 succeeds after fresh snapshot of the dismissed overlay',
          passed: cleanClick.success === true,
          evidence: cleanClick.success
            ? cleanClick.wrappedSafeOutput.split('\n')[1]
            : cleanClick.loudFailureReason ?? 'unexpected failure',
        }
      );
    } catch (err) {
      assertions.push({
        name: 'scenario execution completed without engine error',
        passed: false,
        evidence: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      scenarioId: 'scenario3_task4_agent_browser',
      title: '[Task 4] Agent-Browser snapshot -> @e1 RefMap loop with loud failures + CSPRNG boundaries',
      passed: assertions.every((a) => a.passed),
      assertions,
      durationMs: Date.now() - start,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Scenario 4 — PHASE 10: production wiring (GAPs #1 + #2)             */
  /* ------------------------------------------------------------------ */

  /**
   * Proves the Phase 10 wiring against REAL disk + engine state:
   *   GAP #1 — approving a staged artifact atomically writes the proposed
   *     bytes to the workspace, snapshots the pre-commit state into
   *     `.apexpad-backups/<id>.bak`, records the SHA-256 ledger row, and a
   *     1-click rollback restores the exact original bytes (or deletes a
   *     newly-created file).
   *   GAP #2 — the strict quarantine gate HARD-BLOCKS a candidate edit
   *     carrying a hallucinated import + lazy truncation placeholder: it is
   *     persisted to `quarantined_edits` and never reaches Artifact Staging.
   */
  private async runScenario4ProductionWiring(): Promise<E2eScenarioReport> {
    const start = Date.now();
    const sessionId = `sess_e2e_p10_${crypto.randomBytes(3).toString('hex')}`;
    const assertions: E2eAssertion[] = [];

    const relPath = `e2e/p10/chargeCard_${crypto.randomBytes(3).toString('hex')}.ts`;
    const originalDiskContent = [
      `export function chargeCard(amount: number): boolean {`,
      `  if (amount <= 0) throw new Error('Invalid amount');`,
      `  return true;`,
      `}`,
    ].join('\n');
    const proposedDiskContent = [
      `export function chargeCard(amount: number): boolean {`,
      `  if (amount <= 0) throw new Error('Invalid amount');`,
      `  if (amount > 100000) throw new Error('Limit exceeded');`,
      `  return true;`,
      `}`,
    ].join('\n');

    try {
      await this.memoryRouter.startSession({
        sessionId,
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        branchName: 'main',
        firstPrompt: 'Phase 10 production wiring verification',
      });

      // Pre-seed the workspace file so the commit has a real pre-state to back up.
      const absPath = resolveSafeWorkspacePath(relPath);
      fs.mkdirSync(absPath.slice(0, absPath.lastIndexOf('/')), { recursive: true });
      fs.writeFileSync(absPath, originalDiskContent, 'utf8');

      // ---- GAP #1: stage -> approve -> verify disk + .bak + ledger ----
      const dagState = await this.dagOrchestrator.executeDagUpToStaging({
        sessionId,
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        userGoal: 'Add upper limit validation to chargeCard',
        tokenBudgetCeiling: 4000,
        candidateEdits: [
          {
            targetFilePath: relPath,
            previousContent: originalDiskContent,
            proposedContent: proposedDiskContent,
          },
        ],
      });
      const artifact = dagState.stagedArtifacts[0];
      assertions.push({
        name: 'clean candidate edit staged for human approval',
        passed: Boolean(artifact) && artifact.status === 'staged',
        evidence: artifact
          ? `artifactId=${artifact.artifactId} target=${artifact.targetFilePath}`
          : 'no staged artifact returned',
      });

      const beforeApproval = fs.readFileSync(absPath, 'utf8');
      assertions.push({
        name: 'disk untouched before human approval (gate holds)',
        passed: beforeApproval === originalDiskContent,
        evidence: `disk bytes still original=${beforeApproval === originalDiskContent}`,
      });

      const approval = await this.dagOrchestrator.resolveHumanApproval({
        artifactId: artifact.artifactId,
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        approved: true,
        reviewerNote: 'Phase 10 wiring verification',
      });
      const receipt = approval.diskReceipt;
      const afterApproval = fs.readFileSync(absPath, 'utf8');
      const expectedSha = crypto.createHash('sha256').update(proposedDiskContent, 'utf8').digest('hex');

      assertions.push(
        {
          name: 'approval atomically wrote proposed bytes to the workspace',
          passed: receipt !== undefined && afterApproval === proposedDiskContent,
          evidence: receipt
            ? `sha256=${receipt.committedSha256.slice(0, 12)}… backup=${receipt.backupFilePath ? 'yes' : 'no'} existedBefore=${receipt.existedBeforeCommit}`
            : 'no disk receipt returned',
        },
        {
          name: 'committed SHA-256 matches the exact on-disk bytes',
          passed: receipt?.committedSha256 === expectedSha,
          evidence: `expected=${expectedSha.slice(0, 12)}… actual=${receipt?.committedSha256.slice(0, 12) ?? '—'}…`,
        },
        {
          name: 'pre-commit `.bak` snapshot exists on disk',
          passed: Boolean(receipt?.backupFilePath) && fs.existsSync(receipt?.backupFilePath ?? ''),
          evidence: `backupFilePath=${receipt?.backupFilePath ?? 'none'}`,
        }
      );

      // ---- GAP #1: 1-click rollback restores exact original bytes ----
      const rollback = await this.dagOrchestrator.rollbackCommittedArtifact({
        artifactId: artifact.artifactId,
        reason: 'Phase 10 deterministic rollback verification',
        projectSlug: E2E_SUITE_PROJECT_SLUG,
      });
      const afterRollback = fs.readFileSync(absPath, 'utf8');
      const ledgerRow = await db.artifactDiskCommit.findUnique({
        where: { artifactId: artifact.artifactId },
      });

      assertions.push(
        {
          name: '1-click rollback restored the exact original bytes from .bak',
          passed: afterRollback === originalDiskContent && rollback.restoredSha256 !== null,
          evidence: `restoredSha256=${rollback.restoredSha256?.slice(0, 12) ?? '—'}… wasDeletedBecauseNew=${rollback.wasDeletedBecauseNew}`,
        },
        {
          name: 'disk-commit ledger row marked rolled back',
          passed: ledgerRow?.rolledBack === true && ledgerRow.rollbackReason !== null,
          evidence: `rolledBack=${ledgerRow?.rolledBack} reason=${ledgerRow?.rollbackReason ?? '—'}`,
        }
      );

      // ---- GAP #2: strict quarantine gate blocks the flawed edit ----
      const flawedResult = await this.fullPipeline!.executeFullPipeline({
        sessionId,
        projectSlug: E2E_SUITE_PROJECT_SLUG,
        rawUserPrompt: 'Update the session cache module',
        tokenBudgetCeiling: 4000,
        candidateEdits: [
          {
            targetFilePath: 'src/cache/sessionCache.ts',
            previousContent: `export function getSession(id: string): string | null {\n  return id ? \`session:\${id}\` : null;\n}\n`,
            proposedContent: [
              `import { redisCluster } from '@nonexistent-hallucinated/redis-fleet';`,
              ``,
              `export function getSession(id: string): string | null {`,
              `  return id ? \`session:\${id}\` : null;`,
              `}`,
              ``,
              `export function invalidateAllSessions(): void {`,
              // A bare (nonstandard) truncation marker the AST splicer does NOT
              // recognize — proving the quarantine gate blocks what the healer
              // cannot heal (blueprint GAP #2 blocking-reason contract).
              `... rest of existing code remains unchanged ...`,
              `}`,
            ].join('\n'),
          },
        ],
        strictQuarantineGate: true,
      });

      const reasons = flawedResult.quarantinedEdits[0]?.blockingReasons.join(' | ') ?? '';
      assertions.push(
        {
          name: 'quarantine gate hard-blocked the flawed edit before staging',
          passed:
            flawedResult.pipelineBlockedByQuarantine === true &&
            flawedResult.quarantinedEdits.length === 1 &&
            flawedResult.dagState.stagedArtifacts.length === 0,
          evidence: `blocked=${flawedResult.pipelineBlockedByQuarantine} quarantined=${flawedResult.quarantinedEdits.length} staged=${flawedResult.dagState.stagedArtifacts.length} currentNode=${flawedResult.dagState.currentNode}`,
        },
        {
          name: 'blocking reasons name the hallucinated import',
          passed: reasons.includes('@nonexistent-hallucinated/redis-fleet'),
          evidence: reasons || 'no blocking reasons recorded',
        },
        {
          name: 'blocking reasons name the unhealed truncation placeholder',
          passed: reasons.toLowerCase().includes('truncation'),
          evidence: reasons || 'no blocking reasons recorded',
        }
      );
    } catch (err) {
      assertions.push({
        name: 'scenario execution completed without engine error',
        passed: false,
        evidence: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      scenarioId: 'scenario4_phase10_production_wiring',
      title: '[Phase 10] Atomic disk commit + .bak rollback + hard quarantine gate',
      passed: assertions.every((a) => a.passed),
      assertions,
      durationMs: Date.now() - start,
    };
  }
}
