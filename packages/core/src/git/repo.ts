import { closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

/**
 * Read-only access to a git repository's object database, implemented in plain TypeScript: no `git` binary, no processes.
 *
 * Why not run `git show`/`git ls-tree`? Running git inside an untrusted repository can execute repository-configured programs
 * (core.fsmonitor, textconv/diff drivers, ...), and the extension must never spawn a process in a workspace. Reading the
 * object files directly executes nothing: it only inflates bytes and parses them.
 *
 * Supported: loose objects, packfiles (idx v2) with OFS_DELTA and REF_DELTA, packed-refs, symbolic refs, worktrees
 * (`.git` file + commondir), alternates, abbreviated hashes, `~N` / `^N` revision suffixes, annotated tags, merge-base.
 * Not supported: SHA-256 repositories, multi-pack-index/commit-graph acceleration (ignored; not needed), promisor/partial
 * clones (missing blobs raise `missing-object`), reftable.
 */

export type GitErrorCode = "not-a-repo" | "missing-object" | "bad-ref" | "unsupported" | "limit" | "corrupt";
export class GitError extends Error {
  constructor(public code: GitErrorCode, message: string) { super(message); this.name = "GitError"; }
}

export type GitObjectType = "commit" | "tree" | "blob" | "tag";
export interface GitObject { type: GitObjectType; data: Buffer }
/** `time` is the committer time (seconds). `author` is the author NAME only (never the email). */
export interface Commit { sha: string; tree: string; parents: string[]; time: number; subject: string; author: string }
export interface TreeEntry { mode: string; name: string; sha: string }

const MAX_OBJECT_BYTES = 64 * 1024 * 1024;
const MAX_DELTA_DEPTH = 300;
const MAX_TREE_ENTRIES = 500_000;
const HEX40 = /^[0-9a-f]{40}$/;
const TYPES: Record<number, GitObjectType> = { 1: "commit", 2: "tree", 3: "blob", 4: "tag" };

interface Pack {
  path: string;
  idx: Buffer;
  n: number;
  fanout: Uint32Array;
  shaStart: number;
  off32Start: number;
  off64Start: number;
  fd?: number;
  size: number;
  sortedOffsets?: Float64Array;
}

function parseIdx(idx: Buffer): Omit<Pack, "path" | "fd" | "size" | "sortedOffsets"> {
  if (idx.length < 8 + 1024 || idx.readUInt32BE(0) !== 0xff744f63 || idx.readUInt32BE(4) !== 2) throw new GitError("unsupported", "only pack index version 2 is supported");
  const fanout = new Uint32Array(256);
  for (let i = 0; i < 256; i++) fanout[i] = idx.readUInt32BE(8 + i * 4);
  const n = fanout[255]!;
  const shaStart = 8 + 1024;
  const crcStart = shaStart + n * 20;
  const off32Start = crcStart + n * 4;
  const off64Start = off32Start + n * 4;
  if (off64Start > idx.length) throw new GitError("corrupt", "truncated pack index");
  return { idx, n, fanout, shaStart, off32Start, off64Start };
}

/** Binary search for the first index whose sha >= target (20 raw bytes, or a shorter prefix). */
function lowerBound(p: Pack, target: Buffer, len: number): number {
  const first = target[0]!;
  let lo = first === 0 ? 0 : p.fanout[first - 1]!;
  let hi = p.fanout[first]!;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const c = p.idx.compare(target, 0, len, p.shaStart + mid * 20, p.shaStart + mid * 20 + len);
    if (c < 0) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function packOffset(p: Pack, i: number): number {
  const o = p.idx.readUInt32BE(p.off32Start + i * 4);
  if (o & 0x80000000) {
    const big = p.idx.readBigUInt64BE(p.off64Start + (o & 0x7fffffff) * 8);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new GitError("limit", "pack offset too large");
    return Number(big);
  }
  return o;
}

function readVarint(buf: Buffer, pos: { i: number }): number {
  let result = 0, shift = 0, b: number;
  do {
    if (pos.i >= buf.length) throw new GitError("corrupt", "truncated delta");
    b = buf[pos.i++]!;
    result += (b & 0x7f) * 2 ** shift;
    shift += 7;
    if (shift > 56) throw new GitError("corrupt", "bad varint");
  } while (b & 0x80);
  return result;
}

export function applyDelta(base: Buffer, delta: Buffer): Buffer {
  const pos = { i: 0 };
  const srcSize = readVarint(delta, pos);
  const dstSize = readVarint(delta, pos);
  if (srcSize !== base.length) throw new GitError("corrupt", "delta base size mismatch");
  if (dstSize > MAX_OBJECT_BYTES) throw new GitError("limit", "object too large");
  const out = Buffer.allocUnsafe(dstSize);
  let o = 0;
  while (pos.i < delta.length) {
    const cmd = delta[pos.i++]!;
    if (cmd & 0x80) {
      let off = 0, size = 0;
      for (let k = 0; k < 4; k++) if (cmd & (1 << k)) off |= delta[pos.i++]! << (8 * k);
      for (let k = 0; k < 3; k++) if (cmd & (0x10 << k)) size |= delta[pos.i++]! << (8 * k);
      off >>>= 0;
      if (size === 0) size = 0x10000;
      if (off + size > base.length || o + size > dstSize) throw new GitError("corrupt", "delta copy out of range");
      base.copy(out, o, off, off + size);
      o += size;
    } else if (cmd) {
      if (pos.i + cmd > delta.length || o + cmd > dstSize) throw new GitError("corrupt", "delta insert out of range");
      delta.copy(out, o, pos.i, pos.i + cmd);
      pos.i += cmd; o += cmd;
    } else throw new GitError("corrupt", "delta command 0");
  }
  if (o !== dstSize) throw new GitError("corrupt", "delta result size mismatch");
  return out;
}

/** Caps applied to commit text read from a (hostile) repository. */
const COMMIT_LINE_MAX = 4096;
const AUTHOR_MAX = 200;
const SUBJECT_MAX = 1000;

export class GitRepo {
  readonly gitDir: string;
  readonly commonDir: string;
  private objectDirs: string[];
  private packs: Pack[] | undefined;
  private cache = new Map<string, GitObject>();
  private cacheBytes = 0;

  private constructor(gitDir: string, commonDir: string, objectDirs: string[]) {
    this.gitDir = gitDir; this.commonDir = commonDir; this.objectDirs = objectDirs;
  }

  /** Open the repository whose working tree is `root`. Throws GitError("not-a-repo") if there is none. */
  static open(root: string): GitRepo {
    const dotGit = join(root, ".git");
    let st;
    try { st = lstatSync(dotGit); } catch { throw new GitError("not-a-repo", `${root} is not a git working tree`); }
    let gitDir: string;
    if (st.isDirectory()) gitDir = dotGit;
    else if (st.isFile()) {
      const m = /^gitdir:\s*(.+)\s*$/m.exec(readFileSync(dotGit, "utf8"));
      if (!m) throw new GitError("not-a-repo", ".git file has no gitdir line");
      gitDir = isAbsolute(m[1]!) ? m[1]! : resolve(root, m[1]!);
    } else throw new GitError("unsupported", ".git is a symlink or special file");
    return GitRepo.openGitDir(gitDir);
  }

  /** Open a bare repository or a .git directory directly. */
  static openGitDir(gitDir: string): GitRepo {
    if (!existsSync(join(gitDir, "HEAD"))) throw new GitError("not-a-repo", `${gitDir} has no HEAD`);
    let commonDir = gitDir;
    const cd = join(gitDir, "commondir");
    if (existsSync(cd)) { const t = readFileSync(cd, "utf8").trim(); commonDir = isAbsolute(t) ? t : resolve(gitDir, t); }
    const objects = join(commonDir, "objects");
    const dirs = [objects];
    const alt = join(objects, "info", "alternates");
    if (existsSync(alt)) {
      for (const l of readFileSync(alt, "utf8").split(/\r?\n/).slice(0, 8)) {
        const t = l.trim();
        if (t && !t.startsWith("#")) dirs.push(isAbsolute(t) ? t : resolve(objects, t));
      }
    }
    if (existsSync(join(commonDir, "objects", "info", "alternates")) === false && existsSync(join(gitDir, "reftable"))) throw new GitError("unsupported", "reftable repositories are not supported");
    return new GitRepo(gitDir, commonDir, dirs);
  }

  // ------------------------------------------------------------------ objects

  private loadPacks(): Pack[] {
    if (this.packs) return this.packs;
    const packs: Pack[] = [];
    for (const od of this.objectDirs) {
      const pd = join(od, "pack");
      let names: string[] = [];
      try { names = readdirSync(pd); } catch { continue; }
      for (const n of names.filter((x) => x.endsWith(".idx")).slice(0, 2000)) {
        try {
          const idx = readFileSync(join(pd, n));
          const parsed = parseIdx(idx);
          const packPath = join(pd, n.replace(/\.idx$/, ".pack"));
          packs.push({ ...parsed, path: packPath, size: 0 });
        } catch (e) { if (e instanceof GitError && e.code === "unsupported") throw e; /* unreadable pack: skip */ }
      }
    }
    return (this.packs = packs);
  }

  private packFd(p: Pack): number {
    if (p.fd === undefined) { p.fd = openSync(p.path, "r"); p.size = fstatSync(p.fd).size; }
    return p.fd;
  }

  /** Release file descriptors. The repo can still be used afterwards (packs are reopened on demand). */
  close(): void {
    for (const p of this.packs ?? []) if (p.fd !== undefined) { try { closeSync(p.fd); } catch { /* ignore */ } p.fd = undefined; }
    this.cache.clear(); this.cacheBytes = 0;
  }

  private remember(sha: string, o: GitObject): void {
    if (o.data.length > 4 * 1024 * 1024) return;
    this.cache.set(sha, o); this.cacheBytes += o.data.length;
    while (this.cacheBytes > 48 * 1024 * 1024 || this.cache.size > 2000) {
      const k = this.cache.keys().next().value as string | undefined;
      if (k === undefined) break;
      this.cacheBytes -= this.cache.get(k)!.data.length; this.cache.delete(k);
    }
  }

  private readLoose(sha: string): GitObject | undefined {
    for (const od of this.objectDirs) {
      const p = join(od, sha.slice(0, 2), sha.slice(2));
      let raw: Buffer;
      try { raw = readFileSync(p); } catch { continue; }
      let inflated: Buffer;
      try { inflated = inflateSync(raw, { maxOutputLength: MAX_OBJECT_BYTES + 64 }); }
      catch (e) {
        const big = (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" || /maxOutputLength|larger than/i.test(String(e));
        throw new GitError(big ? "limit" : "corrupt", big ? `object ${sha} exceeds the ${MAX_OBJECT_BYTES / (1024 * 1024)} MB size limit` : `cannot inflate loose object ${sha}`);
      }
      const nul = inflated.indexOf(0);
      if (nul < 0) throw new GitError("corrupt", `bad loose object header ${sha}`);
      const m = /^(commit|tree|blob|tag) (\d+)$/.exec(inflated.toString("latin1", 0, nul));
      if (!m) throw new GitError("corrupt", `bad loose object header ${sha}`);
      const data = inflated.subarray(nul + 1);
      if (data.length !== Number(m[2])) throw new GitError("corrupt", `loose object size mismatch ${sha}`);
      return { type: m[1] as GitObjectType, data };
    }
    return undefined;
  }

  private sortedOffsets(p: Pack): Float64Array {
    if (!p.sortedOffsets) {
      const arr = new Float64Array(p.n);
      for (let i = 0; i < p.n; i++) arr[i] = packOffset(p, i);
      arr.sort();
      p.sortedOffsets = arr;
    }
    return p.sortedOffsets;
  }

  private packEntry(p: Pack, offset: number, depth: number): GitObject {
    if (depth > MAX_DELTA_DEPTH) throw new GitError("limit", "delta chain too deep");
    const fd = this.packFd(p);
    const offs = this.sortedOffsets(p);
    // end of this entry = start of the next one (or the 20-byte pack trailer)
    let lo = 0, hi = offs.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (offs[mid]! <= offset) lo = mid + 1; else hi = mid; }
    const end = lo < offs.length ? offs[lo]! : p.size - 20;
    const len = end - offset;
    if (len <= 0 || len > MAX_OBJECT_BYTES + 1024) throw new GitError("limit", "pack entry out of range");
    const buf = Buffer.allocUnsafe(len);
    if (readSync(fd, buf, 0, len, offset) !== len) throw new GitError("corrupt", "short read from pack");
    const pos = { i: 0 };
    let b = buf[pos.i++]!;
    const type = (b >> 4) & 7;
    let size = b & 15, shift = 4;
    while (b & 0x80) { b = buf[pos.i++]!; size += (b & 0x7f) * 2 ** shift; shift += 7; if (shift > 56) throw new GitError("corrupt", "bad pack size"); }
    if (size > MAX_OBJECT_BYTES) throw new GitError("limit", "object too large");
    const inflate = (from: number): Buffer => {
      try { return inflateSync(buf.subarray(from), { maxOutputLength: Math.max(size, 1) }); }
      catch { throw new GitError("corrupt", "cannot inflate pack entry"); }
    };
    if (type >= 1 && type <= 4) {
      const data = inflate(pos.i);
      if (data.length !== size) throw new GitError("corrupt", "pack entry size mismatch");
      return { type: TYPES[type]!, data };
    }
    if (type === 6) {
      let c = buf[pos.i++]!;
      let ofs = c & 0x7f;
      while (c & 0x80) { c = buf[pos.i++]!; ofs = (ofs + 1) * 128 + (c & 0x7f); }
      const base = this.packEntry(p, offset - ofs, depth + 1);
      return { type: base.type, data: applyDelta(base.data, inflate(pos.i)) };
    }
    if (type === 7) {
      const baseSha = buf.subarray(pos.i, pos.i + 20).toString("hex");
      pos.i += 20;
      const base = this.readObject(baseSha, depth + 1);
      return { type: base.type, data: applyDelta(base.data, inflate(pos.i)) };
    }
    throw new GitError("corrupt", `unknown pack object type ${type}`);
  }

  /** Read an object by full 40-hex id. Throws GitError("missing-object") if it is not present. */
  readObject(sha: string, depth = 0): GitObject {
    if (!HEX40.test(sha)) throw new GitError("bad-ref", `not an object id: ${sha}`);
    const hit = this.cache.get(sha);
    if (hit) return hit;
    let obj = this.readLoose(sha);
    if (!obj) {
      const raw = Buffer.from(sha, "hex");
      for (const p of this.loadPacks()) {
        const i = lowerBound(p, raw, 20);
        if (i < p.n && p.idx.compare(raw, 0, 20, p.shaStart + i * 20, p.shaStart + i * 20 + 20) === 0) { obj = this.packEntry(p, packOffset(p, i), depth); break; }
      }
    }
    if (!obj) throw new GitError("missing-object", `object ${sha} is not in this repository (shallow or partial clone?)`);
    this.remember(sha, obj);
    return obj;
  }

  hasObject(sha: string): boolean {
    try { this.readObject(sha); return true; } catch (e) { if (e instanceof GitError && e.code === "missing-object") return false; throw e; }
  }

  /** Expand an abbreviated object id (>= 4 hex chars). Returns undefined if none, throws if ambiguous. */
  expandAbbrev(prefix: string): string | undefined {
    if (!/^[0-9a-f]{4,39}$/.test(prefix)) return undefined;
    const found = new Set<string>();
    for (const od of this.objectDirs) {
      try { for (const n of readdirSync(join(od, prefix.slice(0, 2)))) if ((prefix.slice(0, 2) + n).startsWith(prefix)) found.add(prefix.slice(0, 2) + n); } catch { /* none */ }
    }
    const even = prefix.length % 2 === 0 ? prefix : prefix.slice(0, -1);
    const raw = Buffer.from(even, "hex");
    for (const p of this.loadPacks()) {
      for (let i = lowerBound(p, raw, raw.length); i < p.n; i++) {
        const sha = p.idx.toString("hex", p.shaStart + i * 20, p.shaStart + i * 20 + 20);
        if (!sha.startsWith(even)) break;
        if (sha.startsWith(prefix)) found.add(sha);
      }
    }
    if (found.size > 1) throw new GitError("bad-ref", `abbreviated id ${prefix} is ambiguous`);
    return [...found][0];
  }

  // ------------------------------------------------------------------ parsed objects

  commit(sha: string): Commit {
    const o = this.readObject(sha);
    if (o.type !== "commit") throw new GitError("corrupt", `${sha} is a ${o.type}, not a commit`);
    const text = o.data.toString("utf8");
    const headEnd = text.indexOf("\n\n");
    const head = headEnd < 0 ? text : text.slice(0, headEnd);
    let tree = "", time = 0, author = "";
    const parents: string[] = [];
    for (const rawLine of head.split("\n")) {
      // Hostile input: a commit header line or message can be megabytes long. Everything is capped before it is looked at, and no
      // regular expression is run over uncapped text (the name is cut at the first "<", the time is the second-to-last token).
      const line = rawLine.length > COMMIT_LINE_MAX ? rawLine.slice(0, COMMIT_LINE_MAX) : rawLine;
      if (line.startsWith("tree ")) tree = line.slice(5).trim();
      else if (line.startsWith("parent ")) parents.push(line.slice(7).trim());
      else if (line.startsWith("author ")) { const lt = line.indexOf("<"); author = (lt >= 0 ? line.slice(7, lt) : line.slice(7)).trim().slice(0, AUTHOR_MAX); }
      else if (line.startsWith("committer ")) { const t = line.trimEnd().split(" "); t.pop(); const ts = t.pop() ?? ""; if (ts.length <= 15 && /^\d+$/.test(ts)) time = Number(ts); }
    }
    if (!HEX40.test(tree)) throw new GitError("corrupt", `commit ${sha} has no tree`);
    const message = headEnd < 0 ? "" : text.slice(headEnd + 2, headEnd + 2 + SUBJECT_MAX * 4);
    return { sha, tree, parents, time, subject: (message.split("\n")[0] ?? "").slice(0, SUBJECT_MAX), author };
  }

  tree(sha: string): TreeEntry[] {
    const o = this.readObject(sha);
    if (o.type !== "tree") throw new GitError("corrupt", `${sha} is a ${o.type}, not a tree`);
    const out: TreeEntry[] = [];
    const d = o.data;
    let i = 0;
    while (i < d.length) {
      const sp = d.indexOf(0x20, i), nul = d.indexOf(0, sp);
      if (sp < 0 || nul < 0 || nul + 21 > d.length) throw new GitError("corrupt", "bad tree entry");
      out.push({ mode: d.toString("latin1", i, sp), name: d.toString("utf8", sp + 1, nul), sha: d.toString("hex", nul + 1, nul + 21) });
      i = nul + 21;
      if (out.length > MAX_TREE_ENTRIES) throw new GitError("limit", "tree too large");
    }
    return out;
  }

  /** Peel tags until a commit is reached. */
  peelToCommit(sha: string): string {
    let cur = sha;
    for (let i = 0; i < 8; i++) {
      const o = this.readObject(cur);
      if (o.type === "commit") return cur;
      if (o.type !== "tag") throw new GitError("bad-ref", `${sha} does not point at a commit`);
      const m = /^object ([0-9a-f]{40})/m.exec(o.data.toString("utf8"));
      if (!m) throw new GitError("corrupt", "bad tag object");
      cur = m[1]!;
    }
    throw new GitError("bad-ref", "tag chain too deep");
  }

  // ------------------------------------------------------------------ refs

  private safeRefName(name: string): boolean {
    return name.length > 0 && name.length < 256 && !name.includes("..") && !name.includes("\0") && !name.startsWith("/") && !name.includes("\\") && !/[\s~^:?*[]/.test(name) && !name.endsWith(".lock");
  }

  private readRefFile(path: string, depth = 0): string | undefined {
    let t: string;
    try { t = readFileSync(path, "utf8").trim(); } catch { return undefined; }
    if (t.startsWith("ref: ")) {
      if (depth > 8) throw new GitError("bad-ref", "symbolic ref chain too deep");
      return this.readRef(t.slice(5).trim(), depth + 1);
    }
    return HEX40.test(t) ? t : undefined;
  }

  private packedRefs(): Map<string, string> {
    const m = new Map<string, string>();
    let text = "";
    try { text = readFileSync(join(this.commonDir, "packed-refs"), "utf8"); } catch { return m; }
    for (const l of text.split("\n")) {
      if (!l || l[0] === "#" || l[0] === "^") continue;
      const sp = l.indexOf(" ");
      if (sp === 40 && HEX40.test(l.slice(0, 40))) m.set(l.slice(41).trim(), l.slice(0, 40));
    }
    return m;
  }

  /** Resolve a full ref name ("HEAD", "refs/heads/main", ...) to an object id. */
  readRef(name: string, depth = 0): string | undefined {
    if (name !== "HEAD" && !this.safeRefName(name)) throw new GitError("bad-ref", `unsafe ref name: ${name}`);
    const base = name === "HEAD" || name.startsWith("HEAD") ? this.gitDir : this.commonDir;
    return this.readRefFile(join(base, name), depth) ?? this.readRefFile(join(this.commonDir, name), depth) ?? this.packedRefs().get(name);
  }

  /** All branches, remote branches and tags: name (without refs/ prefix) -> commit-ish id. */
  listRefs(limit = 5000): { name: string; full: string; sha: string }[] {
    const out = new Map<string, string>();
    const walk = (dir: string, prefix: string, depth: number) => {
      if (depth > 10 || out.size >= limit) return;
      let entries: import("node:fs").Dirent[] = [];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory()) walk(join(dir, e.name), `${prefix}${e.name}/`, depth + 1);
        else if (e.isFile() && !e.name.endsWith(".lock")) { const sha = this.readRefFile(join(dir, e.name)); if (sha) out.set(prefix + e.name, sha); }
      }
    };
    for (const kind of ["heads", "remotes", "tags"]) walk(join(this.commonDir, "refs", kind), `refs/${kind}/`, 0);
    for (const [k, v] of this.packedRefs()) if (!out.has(k) && /^refs\/(heads|remotes|tags)\//.test(k)) out.set(k, v);
    return [...out].map(([full, sha]) => ({ full, name: full.replace(/^refs\/(heads|remotes|tags)\//, (_m, k: string) => (k === "tags" ? "tags/" : "")), sha }));
  }

  currentBranch(): string | undefined {
    try { const t = readFileSync(join(this.gitDir, "HEAD"), "utf8").trim(); const m = /^ref: refs\/heads\/(.+)$/.exec(t); return m?.[1]; } catch { return undefined; }
  }

  /**
   * Resolve a revision expression to a COMMIT id: HEAD, branch, remote branch (origin/main), tag, full or abbreviated id,
   * with optional ~N / ^N suffixes.
   */
  resolveCommit(rev: string): string {
    const m = /^(.*?)((?:[~^]\d*)*)$/.exec(rev.trim());
    const baseName = m?.[1] ?? rev, suffix = m?.[2] ?? "";
    if (!baseName) throw new GitError("bad-ref", `empty revision: ${rev}`);
    let sha: string | undefined;
    if (HEX40.test(baseName)) sha = baseName;
    else {
      for (const cand of baseName === "HEAD" ? ["HEAD"] : [baseName, `refs/${baseName}`, `refs/tags/${baseName}`, `refs/heads/${baseName}`, `refs/remotes/${baseName}`, `refs/remotes/${baseName}/HEAD`]) {
        if (cand !== "HEAD" && !this.safeRefName(cand)) continue;
        sha = this.readRef(cand);
        if (sha) break;
      }
      if (!sha && /^[0-9a-f]{4,39}$/.test(baseName)) sha = this.expandAbbrev(baseName);
    }
    if (!sha) throw new GitError("bad-ref", `unknown revision: ${rev}`);
    let c = this.peelToCommit(sha);
    for (const op of suffix.match(/[~^]\d*/g) ?? []) {
      const n = op.length > 1 ? Number(op.slice(1)) : 1;
      if (op[0] === "~") { for (let i = 0; i < n; i++) { const p = this.commit(c).parents[0]; if (!p) throw new GitError("bad-ref", `${rev}: no such ancestor`); c = p; } }
      else if (n > 0) { const p = this.commit(c).parents[n - 1]; if (!p) throw new GitError("bad-ref", `${rev}: no such parent`); c = p; }
    }
    // ~N / ^N only read parent ids; make sure the commit we landed on really is in this repository (shallow clones lack ancestors)
    if (suffix) this.commit(c);
    return c;
  }

  // ------------------------------------------------------------------ history

  /**
   * A merge base of two commits: the most recent common ancestor (by commit time). Returns undefined if none is reachable
   * (unrelated histories, or a shallow clone that does not contain it).
   */
  mergeBase(a: string, b: string, maxCommits = 100_000): string | undefined {
    if (a === b) return a;
    const ancestorsOfA = new Set<string>();
    const queue: string[] = [a];
    while (queue.length && ancestorsOfA.size < maxCommits) {
      const c = queue.pop()!;
      if (ancestorsOfA.has(c)) continue;
      ancestorsOfA.add(c);
      try { queue.push(...this.commit(c).parents); } catch (e) { if (!(e instanceof GitError && e.code === "missing-object")) throw e; }
    }
    // walk b's history newest-first until we hit something reachable from a
    const seen = new Set<string>();
    const frontier: Commit[] = [];
    const push = (sha: string) => { if (seen.has(sha)) return; seen.add(sha); try { frontier.push(this.commit(sha)); } catch (e) { if (!(e instanceof GitError && e.code === "missing-object")) throw e; } };
    push(b);
    let steps = 0;
    while (frontier.length && steps++ < maxCommits) {
      frontier.sort((x, y) => y.time - x.time);
      const c = frontier.shift()!;
      if (ancestorsOfA.has(c.sha)) return c.sha;
      for (const p of c.parents) push(p);
    }
    return undefined;
  }
}

/** Is `path` (inside `dir`) the same as `dir` itself or a descendant? Used to keep reads inside the git directory. */
export function isInside(dir: string, path: string): boolean {
  const d = resolve(dir), p = resolve(path);
  return p === d || p.startsWith(d + (d.endsWith("/") || d.endsWith("\\") ? "" : (process.platform === "win32" ? "\\" : "/")));
}
void dirname;
