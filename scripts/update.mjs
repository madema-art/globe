import { git } from './common.mjs';

// Conservative policy: any tracked edit OR non-ignored untracked file blocks integration.
// Fetch does not alter the working tree; merge --ff-only --no-overwrite-ignore
// additionally protects ignored files which an incoming commit might introduce.
export async function safeUpdate({ cwd, remote = 'origin', branch = 'main', log = () => {} }) {
  const g = (args) => git(args, cwd);
  try {
    await g(['fetch', '--no-tags', remote, `refs/heads/${branch}:refs/remotes/${remote}/${branch}`]);
  } catch (error) {
    log(`Fetch unavailable or refused: ${error.message}`);
    return { status: 'offline' };
  }
  if (await g(['branch', '--show-current']) !== branch) return { status: 'blocked-branch' };
  if (await g(['status', '--porcelain=v1', '--untracked-files=all'])) return { status: 'blocked-dirty' };
  const target = `refs/remotes/${remote}/${branch}`;
  const head = await g(['rev-parse', 'HEAD']);
  if (head === await g(['rev-parse', target])) return { status: 'current' };
  try { await g(['merge-base', '--is-ancestor', 'HEAD', target]); }
  catch { return { status: 'blocked-divergent-or-ahead' }; }
  // Git rechecks collisions and index locks itself; no stashes, resets, cleans, or branch switches.
  try {
    await g(['merge', '--ff-only', '--no-overwrite-ignore', target]);
    return { status: 'updated', previous: head, commit: await g(['rev-parse', 'HEAD']) };
  } catch (error) {
    log(`Fast-forward blocked: ${error.message}`);
    return { status: 'blocked-merge' };
  }
}
