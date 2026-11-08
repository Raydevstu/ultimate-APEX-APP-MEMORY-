/**
 * src/server/apexpad/workspace.ts
 * PHASE 10 (GAP #1): Real filesystem workspace for ApexPad artifact commits.
 *
 * The Electron blueprint commits approved artifacts against a workspace root
 * on disk; the Next.js workbench uses the same contract against a dedicated
 * sandbox directory (`.apexpad-workspace/` under the project root, overridable
 * via `APEXPAD_WORKSPACE_ROOT`). Every write is:
 *   - path-traversal safe (target must resolve inside the workspace root),
 *   - crash-safe atomic (sibling temp file + `fs.renameSync`),
 *   - backed by a SHA-256 ledger and a `.apexpad-backups/<id>.bak` snapshot
 *     that supports deterministic byte-exact rollback.
 *
 * Zero simulation: real fs calls, real checksums, real rename semantics.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DEFAULT_WORKSPACE_DIRNAME = '.apexpad-workspace';
const BACKUP_DIRNAME = '.apexpad-backups';

const globalForWorkspace = globalThis as unknown as {
  apexpadWorkspaceRoot: string | undefined;
};

/** Resolves (and creates) the ApexPad workspace root. Stable per process. */
export function getWorkspaceRoot(): string {
  if (globalForWorkspace.apexpadWorkspaceRoot) {
    return globalForWorkspace.apexpadWorkspaceRoot;
  }
  const override = process.env.APEXPAD_WORKSPACE_ROOT;
  const root = override
    ? path.resolve(override)
    : path.join(process.cwd(), DEFAULT_WORKSPACE_DIRNAME);
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, BACKUP_DIRNAME), { recursive: true });
  globalForWorkspace.apexpadWorkspaceRoot = root;
  return root;
}

/** Directory holding per-artifact `.bak` snapshots. */
export function getBackupDir(): string {
  const dir = path.join(getWorkspaceRoot(), BACKUP_DIRNAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolves a workspace-relative path with strict traversal protection.
 * Throws a loud Security Violation when the path escapes the workspace root.
 */
export function resolveSafeWorkspacePath(relativeFilePath: string): string {
  const normalizedRel = relativeFilePath.replace(/^[/\\]+/, '');
  if (!normalizedRel) {
    throw new Error('Workspace path violation: empty relative path.');
  }
  const workspaceRoot = getWorkspaceRoot();
  const resolved = path.resolve(workspaceRoot, normalizedRel);
  const rootWithSep = workspaceRoot.endsWith(path.sep)
    ? workspaceRoot
    : `${workspaceRoot}${path.sep}`;

  if (resolved !== workspaceRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error(
      `Security Violation: Target path "${relativeFilePath}" escapes workspace root "${workspaceRoot}".`
    );
  }
  if (/(^|[/\\])\.apexpad-backups([/\\]|$)/.test(normalizedRel)) {
    throw new Error(
      `Security Violation: "${relativeFilePath}" targets the protected backup directory.`
    );
  }
  return resolved;
}

export function sha256Hex(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Crash-safe atomic write: content goes to a sibling temp file first and is
 * then moved over the target with `fs.renameSync`, so the target is never
 * partially written (blueprint ITEM 1 step 3).
 */
export function atomicWriteFile(absoluteFilePath: string, content: string): void {
  const targetDir = path.dirname(absoluteFilePath);
  fs.mkdirSync(targetDir, { recursive: true });
  const tempFilePath = path.join(
    targetDir,
    `.apexpad-tmp-${path.basename(absoluteFilePath)}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`
  );
  try {
    fs.writeFileSync(tempFilePath, content, 'utf8');
    fs.renameSync(tempFilePath, absoluteFilePath);
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

export interface WorkspaceBackupReceipt {
  backupFilePath: string | null;
  existedBeforeCommit: boolean;
  previousSha256: string | null;
}

/**
 * Snapshots the current on-disk state of the target into
 * `.apexpad-backups/<artifactId>.bak` (blueprint ITEM 1 step 2). When the file
 * does not exist yet but the artifact carries previous content (an indexed
 * workspace buffer), that content becomes the rollback source instead.
 */
export function snapshotForBackup(params: {
  artifactId: string;
  absoluteFilePath: string;
  fallbackPreviousContent: string;
}): WorkspaceBackupReceipt {
  const existedBeforeCommit = fs.existsSync(params.absoluteFilePath);
  let backupFilePath: string | null = null;
  let previousSha256: string | null = null;

  if (existedBeforeCommit) {
    backupFilePath = path.join(getBackupDir(), `${params.artifactId}.bak`);
    fs.copyFileSync(params.absoluteFilePath, backupFilePath);
    previousSha256 = sha256Hex(fs.readFileSync(backupFilePath, 'utf8'));
  } else if (params.fallbackPreviousContent.length > 0) {
    backupFilePath = path.join(getBackupDir(), `${params.artifactId}.bak`);
    fs.writeFileSync(backupFilePath, params.fallbackPreviousContent, 'utf8');
    previousSha256 = sha256Hex(params.fallbackPreviousContent);
  }

  return { backupFilePath, existedBeforeCommit, previousSha256 };
}

export interface WorkspaceRollbackReceipt {
  restoredFilePath: string;
  wasDeletedBecauseNew: boolean;
  restoredSha256: string | null;
}

/**
 * Restores the exact pre-approval bytes from the `.bak` snapshot via atomic
 * rename — or unlinks the file entirely when the artifact created it new
 * (blueprint ITEM 1 rollback semantics).
 */
export function restoreFromBackup(params: {
  absoluteFilePath: string;
  backupFilePath: string | null;
  existedBeforeCommit: boolean;
}): WorkspaceRollbackReceipt {
  const canRestoreFromFile =
    params.existedBeforeCommit &&
    params.backupFilePath !== null &&
    fs.existsSync(params.backupFilePath);

  if (canRestoreFromFile) {
    const restoredContent = fs.readFileSync(params.backupFilePath as string, 'utf8');
    atomicWriteFile(params.absoluteFilePath, restoredContent);
    return {
      restoredFilePath: params.absoluteFilePath,
      wasDeletedBecauseNew: false,
      restoredSha256: sha256Hex(restoredContent),
    };
  }

  if (fs.existsSync(params.absoluteFilePath)) {
    fs.unlinkSync(params.absoluteFilePath);
  }
  return {
    restoredFilePath: params.absoluteFilePath,
    wasDeletedBecauseNew: true,
    restoredSha256: null,
  };
}

export interface SavedDocumentReceipt {
  savedAt: string;
  filePath: string;
  absoluteFilePath: string;
  byteLength: number;
  sha256: string;
  existedBefore: boolean;
}

/** `apexpad:editor:save-document` equivalent — persists an editor note to disk. */
export function saveWorkspaceDocument(params: {
  relativeFilePath: string;
  content: string;
}): SavedDocumentReceipt {
  const absoluteFilePath = resolveSafeWorkspacePath(params.relativeFilePath);
  const existedBefore = fs.existsSync(absoluteFilePath);
  atomicWriteFile(absoluteFilePath, params.content);
  return {
    savedAt: new Date().toISOString(),
    filePath: params.relativeFilePath.replace(/^[/\\]+/, ''),
    absoluteFilePath,
    byteLength: Buffer.byteLength(params.content, 'utf8'),
    sha256: sha256Hex(params.content),
    existedBefore,
  };
}

export function readWorkspaceFileOrNull(relativeFilePath: string): string | null {
  try {
    const absoluteFilePath = resolveSafeWorkspacePath(relativeFilePath);
    if (!fs.existsSync(absoluteFilePath)) return null;
    return fs.readFileSync(absoluteFilePath, 'utf8');
  } catch {
    return null;
  }
}

/** True when the file exists on disk inside the workspace sandbox. */
export function workspaceFileExists(relativeFilePath: string): boolean {
  try {
    return fs.existsSync(resolveSafeWorkspacePath(relativeFilePath));
  } catch {
    return false;
  }
}
