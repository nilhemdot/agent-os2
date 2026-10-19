import { useCallback, useEffect, useMemo, useState } from "react";

type Mission = {
  id: string;
  title: string;
  state: string;
  display_state?: string;
  repo?: { name: string; root_path: string } | null;
  budget_usd: number | null;
  spent_usd: number;
  pending_approvals: number;
  running_attempts: { id: string; runtime: string; state: string; gated: string }[];
  task_counts: Record<string, number>;
  updated_at?: string;
  criteria?: { kind: string; value: string }[];
  objective?: string | null;
  spent_includes_unknown?: number;
  spent_includes_estimated?: number;
};

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body.error?.message || response.statusText);
  return body;
}

function useHash() {
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const [live, setLive] = useState<"live" | "reconnecting">("live");
  const [palette, setPalette] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [notice, setNotice] = useState(localStorage.getItem("agentos-sandbox-ack") ? "" : "policy-not-sandbox");

  const reload = useCallback(async () => {
    try {
      const body = await api("/missions");
      setMissions(body.missions);
      setPending(body.missions.reduce((sum: number, mission: Mission) => sum + mission.pending_approvals, 0));
      const policy = await api("/policy/lint");
      setPolicyError(policy.error);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
    let source: EventSource | null = null;
    let last = 0;
    let stopped = false;
    const connect = () => {
      source = new EventSource("/events/stream", { withCredentials: true });
      source.onopen = () => setLive("live");
      source.onerror = () => {
        setLive("reconnecting");
        source?.close();
        if (!stopped) setTimeout(connect, 800);
      };
      source.onmessage = (event) => {
        last = Number(event.lastEventId || last);
        void reload();
      };
      source.addEventListener("resync", () => {
        source?.close();
        void reload();
        if (!stopped) connect();
      });
    };
    connect();
    return () => {
      stopped = true;
      source?.close();
    };
  }, [reload]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
      }
      if (event.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const route = hash.replace(/^#/, "") || "/";
  let page = <Home missions={missions} error={error} onCreated={reload} />;
  if (route.startsWith("/mission/")) page = <MissionPage id={route.split("/")[2]} onChange={reload} />;
  else if (route.startsWith("/attempt/")) page = <AttemptPage id={route.split("/")[2]} />;
  else if (route.startsWith("/inbox")) page = <Inbox onChange={reload} />;
  else if (route.startsWith("/adapters")) page = <Adapters />;
  else if (route.startsWith("/settings")) page = <Settings />;

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#/">
          AgentOS
          <small>Local control plane</small>
        </a>
        <nav className="nav">
          <a href="#/inbox" data-testid="inbox-link">
            Inbox {pending > 0 && <span className="badge" data-testid="inbox-count">{pending}</span>}
          </a>
          <a href="#/adapters">Adapters</a>
          <a href="#/settings">Settings</a>
          <button className="btn ghost" onClick={() => setPalette(true)}>Ctrl-K</button>
        </nav>
      </header>
      {live === "reconnecting" && <div className="banner warn" data-testid="reconnect">Reconnecting to the daemon. Status may be stale until the stream catches up.</div>}
      {policyError && <div className="banner warn">Policy was not reloaded: {policyError}. The last valid policy is still active.</div>}
      {notice && (
        <div className="banner" data-testid="sandbox-notice">
          Policy matching on tool calls is not a sandbox. A determined agent can evade it, for example by writing a script and running it. Untrusted tasks still need an OS-level sandbox. Codex keeps its own sandbox on.
          <button className="btn ghost" onClick={() => { localStorage.setItem("agentos-sandbox-ack", "1"); setNotice(""); }}>Understood</button>
        </div>
      )}
      <main className="main">{page}</main>
      {palette && <Palette missions={missions ?? []} onClose={() => setPalette(false)} onChange={reload} />}
    </div>
  );
}

function Home({ missions, error, onCreated }: { missions: Mission[] | null; error: string; onCreated: () => void }) {
  if (error && !missions) return <div className="card bad" data-testid="auth-error">Sign in from the one-time launch URL printed by <span className="mono">agentos daemon start</span>. {error}</div>;
  if (!missions) return <div className="card">Loading missions…</div>;
  return (
    <>
      {missions.length === 0 && (
        <div className="card" data-testid="first-run">
          <h1>Nothing is running yet.</h1>
          <p>Create a mission, attach a repo, set a budget, then start an attempt. AgentOS does not run its own agent loop. It leases a worktree and gates Claude Code or Codex.</p>
        </div>
      )}
      <CreateMission onCreated={onCreated} />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Title</th><th>Repo</th><th>State</th><th>Running</th><th>Approvals</th><th>Verification</th><th>Spent / budget</th><th>Activity</th>
            </tr>
          </thead>
          <tbody>
            {missions.map((mission) => (
              <tr key={mission.id}>
                <td><a href={`#/mission/${mission.id}`}>{mission.title}</a></td>
                <td>{mission.repo?.name ?? "—"}</td>
                <td data-testid={`state-${mission.id}`}>{mission.display_state || mission.state}</td>
                <td>{mission.running_attempts.map((attempt) => attempt.runtime).join(", ") || "—"}</td>
                <td>{mission.pending_approvals}</td>
                <td>{mission.task_counts.passed ? "passed" : mission.task_counts.failed ? "failed" : "—"}</td>
                <td>{money(mission.spent_usd)} / {mission.budget_usd == null ? "—" : money(mission.budget_usd)}{mission.spent_includes_unknown ? " (includes unknown)" : ""}</td>
                <td className="mono">{mission.updated_at?.slice(11, 19) ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function money(value: number): string {
  if (value == null) return "unknown";
  return `$${value.toFixed(4)}`;
}

function CreateMission({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [repo, setRepo] = useState("");
  const [budget, setBudget] = useState("2.00");
  const [criteria, setCriteria] = useState("npm test passes");
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="card"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const mission = await api("/missions", { method: "POST", body: JSON.stringify({ title, repo, budget, criteria: criteria.split("\n").map((line) => line.trim()).filter(Boolean) }) });
          await api(`/missions/${mission.id}/tasks`, { method: "POST", body: JSON.stringify({ title: task || title, profile: "claude-default" }) });
          await api(`/missions/${mission.id}/start`, { method: "POST", body: "{}" });
          setTitle("");
          setTask("");
          onCreated();
          location.hash = `#/mission/${mission.id}`;
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>New mission</h2>
      <div className="row">
        <label>Title<input data-testid="mission-title" value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label>Repo path<input data-testid="mission-repo" value={repo} onChange={(event) => setRepo(event.target.value)} required /></label>
        <label>Budget USD<input data-testid="mission-budget" value={budget} onChange={(event) => setBudget(event.target.value)} required /></label>
      </div>
      <div className="row">
        <label>Success criteria<textarea data-testid="mission-criteria" value={criteria} onChange={(event) => setCriteria(event.target.value)} /></label>
        <label>First task<input data-testid="task-title" value={task} onChange={(event) => setTask(event.target.value)} placeholder="Defaults to the mission title" /></label>
      </div>
      {error && <p className="bad">{error}</p>}
      <button className="btn" data-testid="create-mission" disabled={busy}>Create and start</button>
    </form>
  );
}

function MissionPage({ id, onChange }: { id: string; onChange: () => void }) {
  const [mission, setMission] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<Record<string, any>>({});
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const next = await api(`/missions/${id}`);
      const taskBody = await api(`/missions/${id}/tasks`);
      if (stop) return;
      setMission(next);
      setTasks(taskBody.tasks);
      const map: Record<string, any> = {};
      for (const task of taskBody.tasks) {
        if (task.kind !== "work") continue;
        const view = await api(`/missions/${id}`);
        void view;
      }
      setAttempts(map);
    };
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [id]);
  if (!mission) return <div className="card">Loading mission…</div>;
  return (
    <div>
      <div className="card">
        <h1>{mission.title}</h1>
        <p>{mission.objective || "No extra objective text."}</p>
        <p>State <strong data-testid="mission-state">{mission.display_state || mission.state}</strong> · budget {mission.budget_usd == null ? "unset" : money(mission.budget_usd)} · spent {money(mission.spent_usd)}</p>
        {mission.base_dirty ? <p className="wait">The main checkout was dirty when a workspace was created. Uncommitted work was not copied in.</p> : null}
        <ul>{(mission.criteria || []).map((item: any) => <li key={item.seq}>{item.kind}: {item.value}</li>)}</ul>
        <div className="row">
          <button className="btn ghost" onClick={async () => { if (confirm("Cancel this mission?")) { await api(`/missions/${id}/cancel`, { method: "POST", body: "{}" }); onChange(); } }}>Cancel mission</button>
        </div>
      </div>
      <div className="card">
        <h2>Tasks</h2>
        <ul>
          {tasks.map((task) => (
            <li key={task.id} style={{ marginLeft: task.kind === "verify" ? 18 : 0 }}>
              <span className="mono">{task.seq}</span> {task.title} · {task.state} {task.unverified ? "· unverified" : ""}
              {task.kind === "work" && ["ready", "failed"].includes(task.state) && (
                <button className="btn" data-testid="start-attempt" onClick={async () => {
                  const attempt = await api(`/tasks/${task.id}/attempts`, { method: "POST", body: "{}" });
                  location.hash = `#/attempt/${attempt.id}`;
                }}>Start attempt</button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <AttemptLinks missionId={id} />
    </div>
  );
}

function AttemptLinks({ missionId }: { missionId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    void api(`/missions/${missionId}`).then(async () => {
      const tasks = await api(`/missions/${missionId}/tasks`);
      const found: any[] = [];
      for (const task of tasks.tasks) {
        if (task.kind !== "work") continue;
      }
      setRows(found);
    });
  }, [missionId]);
  return rows.length ? <div className="card">{rows.length} attempts</div> : null;
}

function AttemptPage({ id }: { id: string }) {
  const [attempt, setAttempt] = useState<any>(null);
  const [tab, setTab] = useState("timeline");
  const [events, setEvents] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [diff, setDiff] = useState("");
  const load = useCallback(async () => {
    const body = await api(`/attempts/${id}`);
    setAttempt(body);
    const ev = await api(`/attempts/${id}/events?limit=200`);
    setEvents(ev.events);
    const inbox = await api("/approvals?pending=1");
    setApprovals(inbox.approvals.filter((item: any) => item.attempt_id === id));
    if (tab === "diff") {
      const evidence = await api(`/attempts/${id}/evidence`);
      const list = evidence.items || [];
      const parts: string[] = [];
      for (const kind of ["diff", "uncommitted_diff", "diffstat"]) {
        const item = list.find((row: any) => row.kind === kind);
        if (!item) continue;
        if (item.size_bytes > 2_000_000) {
          parts.push(`${item.label} is ${item.size_bytes} bytes; open it from Evidence.`);
          continue;
        }
        const content = await api(`/evidence/${item.id}/content`);
        if (content.text?.trim()) parts.push(content.text);
      }
      setDiff(parts.join("\n") || "No diff stored yet.");
    }
  }, [id, tab]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 700);
    return () => clearInterval(timer);
  }, [load]);
  if (!attempt) return <div className="card">Loading attempt…</div>;
  const verify = attempt.verification_label;
  return (
    <div className="card">
      <h1>Attempt <span className="mono">{id.slice(0, 10)}</span></h1>
      <p>
        State <strong data-testid="attempt-state">{attempt.state}</strong>
        {attempt.gated !== "all" && <span className="wait"> · {attempt.gated === "none" ? "ungated" : "partially gated"}</span>}
        {" "}· verification <strong data-testid="verify-state">{verify || (attempt.state === "succeeded" ? "pending" : "not run")}</strong>
      </p>
      {(attempt.warnings || []).map((warning: any) => <p key={warning.code} className="wait">{warning.code} {warning.files?.join(", ")}</p>)}
      <p className="mono">{attempt.workspace?.branch} · {attempt.workspace?.path}</p>
      <p>Cost: {typeof attempt.cost === "string" ? attempt.cost : "cost so far: not reported yet"}</p>
      <div className="tabs">
        {["timeline", "approvals", "diff", "logs", "cost", "evidence"].map((name) => (
          <button key={name} className="btn ghost" aria-selected={tab === name} data-testid={`${name}-tab`} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>
      {tab === "timeline" && <ul>{events.map((event) => <li key={event.id}><span className="mono">{event.type}</span> {JSON.stringify(event.payload).slice(0, 180)}</li>)}</ul>}
      {tab === "approvals" && <ApprovalList rows={approvals} />}
      {tab === "diff" && <pre data-testid="diff-body">{diff || "No diff stored yet."}</pre>}
      {tab === "logs" && <p>Test logs and stderr live in the evidence pack.</p>}
      {tab === "cost" && <pre>{JSON.stringify(attempt.cost, null, 2)}{"\n"}{JSON.stringify(attempt.tokens, null, 2)}</pre>}
      {tab === "evidence" && <EvidenceList attemptId={id} />}
      {attempt.state === "succeeded" && (
        <div className="row">
          <button className="btn" onClick={() => api(`/attempts/${id}/accept`, { method: "POST", body: "{}" })}>Accept</button>
          <button className="btn ghost" onClick={() => { const reason = prompt("Why reject?") || ""; void api(`/attempts/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }); }}>Reject</button>
        </div>
      )}
      {["running", "waiting_approval", "starting"].includes(attempt.state) && (
        <button className="btn ghost" onClick={async () => { if (confirm("Cancel this attempt?")) await api(`/attempts/${id}/cancel`, { method: "POST", body: "{}" }); }}>Cancel attempt</button>
      )}
    </div>
  );
}

function ApprovalList({ rows }: { rows: any[] }) {
  return (
    <div>
      {rows.length === 0 && <p>No pending approvals on this attempt.</p>}
      {rows.map((row) => <ApprovalCard key={row.id} row={row} />)}
    </div>
  );
}

function ApprovalCard({ row }: { row: any }) {
  const [born] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  const armed = now - born >= 1000;
  return (
    <article className="card" data-testid="approval-row">
      <p><strong>{row.tool}</strong> · {row.runtime} · {row.branch}</p>
      <p className="mono" data-testid="approval-preview">{reveal ? row.preview : row.preview}</p>
      {row.preview_masked && <button className="btn ghost" onClick={async () => {
        const body = await api(`/approvals?reveal=${row.id}`);
        const full = body.approvals.find((item: any) => item.id === row.id);
        row.preview = full?.preview || row.preview;
        setReveal(true);
      }}>Show all</button>}
      <p>Rule {row.matched_rule_ids} · {row.time_left_s}s left</p>
      <p className="mono">{row.worktree}</p>
      <div className="row">
        <button className="btn" data-testid="approve" disabled={!armed} onClick={() => api(`/approvals/${row.id}/allow`, { method: "POST", body: "{}" })}>Allow</button>
        <button className="btn ghost" onClick={async () => {
          if (!confirm("Deny this call?")) return;
          const reason = prompt("Reason") || "denied in Mission Control";
          await api(`/approvals/${row.id}/deny`, { method: "POST", body: JSON.stringify({ reason }) });
        }}>Deny</button>
      </div>
    </article>
  );
}

function Inbox({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    const load = () => api("/approvals?pending=1").then((body) => setRows(body.approvals));
    void load();
    const timer = setInterval(load, 800);
    return () => clearInterval(timer);
  }, []);
  if (!rows) return <div className="card">Loading inbox…</div>;
  if (!rows.length) return <div className="card">Inbox is clear.</div>;
  return <div onClick={() => onChange()}><ApprovalList rows={rows} /></div>;
}

function Adapters() {
  const [body, setBody] = useState<any>(null);
  useEffect(() => { void api("/adapters").then(setBody); }, []);
  if (!body) return <div className="card">Loading adapters…</div>;
  return (
    <div className="card">
      <h1>Adapters</h1>
      <p>Live checks against installed Claude Code and Codex are not run in this build. The matrix below is the contract, filled with whatever the doctor probe can see.</p>
      <table>
        <thead>
          <tr>
            <th>Runtime</th><th>Version</th><th>Min</th>
            {Object.keys(body.explanations).map((key) => <th key={key} title={body.explanations[key]}>{key}</th>)}
          </tr>
        </thead>
        <tbody>
          {body.adapters.map((adapter: any) => (
            <tr key={adapter.runtime}>
              <td>{adapter.runtime}{adapter.policy_coverage !== "all" ? " · partially gated" : ""}</td>
              <td>{adapter.installed ? adapter.version : "not installed"}</td>
              <td>{adapter.min_version}</td>
              {Object.keys(body.explanations).map((key) => <td key={key}>{String(adapter[key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <ul>{Object.entries(body.explanations).map(([key, text]) => <li key={key}><strong>{key}.</strong> {String(text)}</li>)}</ul>
    </div>
  );
}

function Settings() {
  const [doctor, setDoctor] = useState<any>(null);
  const [gc, setGc] = useState<any>(null);
  useEffect(() => {
    void api("/doctor").then(setDoctor);
    void api("/gc", { method: "POST", body: JSON.stringify({ dry_run: true, yes: false }) }).then(setGc);
  }, []);
  return (
    <div className="card">
      <h1>Settings</h1>
      <p>Policy is not a sandbox. Keep the daemon on 127.0.0.1. Evidence is kept until you garbage-collect released workspaces.</p>
      {doctor && <ul>{doctor.lines.map((line: any) => <li key={line.name}><strong>{line.status}</strong> {line.name}: {line.detail}</li>)}</ul>}
      {gc && <pre>{JSON.stringify(gc, null, 2)}</pre>}
    </div>
  );
}

function EvidenceList({ attemptId }: { attemptId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [md, setMd] = useState("");
  useEffect(() => {
    void api(`/attempts/${attemptId}/evidence`).then(async (body) => {
      const list = body.items || body.evidence || [];
      setItems(list);
      const summary = list.find((item: any) => item.kind === "evidence_md" || item.label === "evidence.md");
      if (summary) {
        const content = await api(`/evidence/${summary.id}/content`);
        setMd(content.text);
      }
    });
  }, [attemptId]);
  return (
    <div>
      <ul>{items.map((item) => <li key={item.id}>{item.kind} · {item.size_bytes} bytes · {item.created_at}</li>)}</ul>
      {md && <pre>{md}</pre>}
    </div>
  );
}

function Palette({ missions, onClose, onChange }: { missions: Mission[]; onClose: () => void; onChange: () => void }) {
  const [query, setQuery] = useState("");
  const [approvals, setApprovals] = useState<any[]>([]);
  useEffect(() => { void api("/approvals?pending=1").then((body) => setApprovals(body.approvals)); }, []);
  const actions = useMemo(() => {
    const items = [
      { label: "New mission", run: () => { location.hash = "#/"; } },
      ...missions.map((mission) => ({ label: `Open ${mission.title}`, run: () => { location.hash = `#/mission/${mission.id}`; } })),
      ...approvals.map((approval) => ({
        label: `Approve ${approval.preview}`,
        run: async () => { await api(`/approvals/${approval.id}/allow`, { method: "POST", body: "{}" }); onChange(); },
      })),
      ...approvals.map((approval) => ({
        label: `Deny ${approval.preview}`,
        run: async () => { if (!confirm("Deny this call?")) return; await api(`/approvals/${approval.id}/deny`, { method: "POST", body: JSON.stringify({ reason: "denied from palette" }) }); onChange(); },
      })),
    ];
    return items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  }, [missions, approvals, query, onChange]);
  return (
    <div className="palette" onClick={onClose}>
      <form onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void actions[0]?.run(); onClose(); }}>
        <input autoFocus data-testid="palette" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="New mission, approve, open…" />
        {actions.slice(0, 8).map((action) => <button key={action.label} type="button" onClick={() => { void action.run(); onClose(); }}>{action.label}</button>)}
      </form>
    </div>
  );
}
