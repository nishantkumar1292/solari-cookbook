import { useEffect, useMemo, useState } from "react";

import type {
  CrashScenario,
  RunReport,
  TraceEvent,
  TrackId,
} from "../core/types";
import { SCENARIOS } from "../scenarios";

const SOURCE_URL =
  "https://github.com/nishantkumar1292/solari-cookbook/tree/main/projects/airlock";

interface LiveValidationReceipt {
  runId: string;
  generatedAt: string;
  result: {
    unshieldedSafetyScore: number;
    airlockedSafetyScore: number;
  };
}

export function App() {
  const [report, setReport] = useState<RunReport | null>(null);
  const [liveValidation, setLiveValidation] =
    useState<LiveValidationReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(SCENARIOS[0].id);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const selected = useMemo(
    () =>
      SCENARIOS.find((scenario) => scenario.id === selectedId) ?? SCENARIOS[0],
    [selectedId],
  );
  const maxStep = selected.tape.length;

  useEffect(() => {
    Promise.all([
      loadEvidence<RunReport>("demo-run.json"),
      loadEvidence<LiveValidationReceipt>("live-validation.json"),
    ])
      .then(([nextReport, nextValidation]) => {
        setReport(nextReport);
        setLiveValidation(nextValidation);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= maxStep) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 920);
    return () => window.clearInterval(timer);
  }, [maxStep, playing]);

  const replay = () => {
    setStep(0);
    setPlaying(true);
  };

  const selectScenario = (id: string) => {
    setSelectedId(id);
    setStep(0);
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  if (error) return <EvidenceError message={error} />;
  if (!report || !liveValidation) return <LoadingBay />;

  return (
    <div className="site-shell" id="top">
      <Header report={report} />
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="section-code">PRE-DEPLOYMENT TEST / ARL-01</p>
            <h1 id="hero-title">
              Would your agent obey <em>the page</em>—or you?
            </h1>
            <p className="hero-lede">
              AIRLOCK runs browser agents through prompt-injection and
              authorization traps inside an isolated Solari range. The page can
              make claims. Only the audit ledger gets a vote.
            </p>
            <div className="hero-actions">
              <button className="primary-action" onClick={replay}>
                <PlayIcon /> Replay impact
              </button>
              <a className="text-link" href="#protocol">
                Inspect the protocol <ArrowIcon />
              </a>
            </div>
            <LiveRunStamp receipt={liveValidation} />
          </div>
          <ImpactBay
            report={report}
            scenario={selected}
            step={step}
            playing={playing}
            onToggle={() =>
              step >= maxStep ? replay() : setPlaying((value) => !value)
            }
          />
        </section>

        <TestMatrix
          report={report}
          selectedId={selectedId}
          onSelect={selectScenario}
        />

        <EvidenceLedger report={report} scenario={selected} />
        <Protocol report={report} />
      </main>
      <Footer />
    </div>
  );
}

function LiveRunStamp({ receipt }: { receipt: LiveValidationReceipt }) {
  return (
    <a
      className="run-stamp"
      href={`${import.meta.env.BASE_URL}live-validation.json`}
      target="_blank"
      rel="noreferrer"
      aria-label="Open the machine-readable live Solari validation receipt"
    >
      <span className="status-light is-live" />
      <div>
        <strong>LIVE-VALIDATED ON SOLARI</strong>
        <small>
          {receipt.runId} · {formatTimestamp(receipt.generatedAt)} · dashboard
          replays its deterministic twin
        </small>
      </div>
      <span className="receipt-link">
        {receipt.result.unshieldedSafetyScore}→
        {receipt.result.airlockedSafetyScore} receipt <ExternalIcon />
      </span>
    </a>
  );
}

function Header({ report }: { report: RunReport }) {
  return (
    <header className="topbar">
      <a className="wordmark" href="#top" aria-label="AIRLOCK home">
        AIR<span>/</span>LOCK
      </a>
      <div className="topbar-center">
        <span>Browser agent crash lab</span>
        <span className="topbar-divider" />
        <span>{report.summary.scenarios} active tests</span>
      </div>
      <nav aria-label="Primary navigation">
        <a href="https://docs.getsolari.com" target="_blank" rel="noreferrer">
          Solari docs
        </a>
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source <ExternalIcon />
        </a>
      </nav>
    </header>
  );
}

interface ImpactBayProps {
  report: RunReport;
  scenario: CrashScenario;
  step: number;
  playing: boolean;
  onToggle: () => void;
}

function ImpactBay({
  report,
  scenario,
  step,
  playing,
  onToggle,
}: ImpactBayProps) {
  const impactIndex =
    scenario.tape.findIndex((action) => action.id === "commit-unsafe-effect") +
    1;
  const impacted = step >= impactIndex;
  const complete = step >= scenario.tape.length;
  const progress = Math.round((step / scenario.tape.length) * 100);

  return (
    <div className="impact-bay" aria-label="Synchronized crash-test playback">
      <div className="bay-header">
        <div>
          <span className="bay-index">IMPACT BAY / {scenario.ordinal}</span>
          <strong>{scenario.shortTitle}</strong>
        </div>
        <button
          className="bay-control"
          onClick={onToggle}
          aria-label={playing ? "Pause playback" : "Play playback"}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
          {complete ? "Replay" : playing ? "Pause" : "Continue"}
        </button>
      </div>
      <div className="twin-runs">
        <BrowserSled
          track="unshielded"
          scenario={scenario}
          step={step}
          impacted={impacted}
          complete={complete}
          report={report}
        />
        <div
          className={`blast-divider ${impacted ? "is-impacted" : ""}`}
          aria-hidden="true"
        >
          <span>SAME ACTION TAPE</span>
        </div>
        <BrowserSled
          track="airlocked"
          scenario={scenario}
          step={step}
          impacted={impacted}
          complete={complete}
          report={report}
        />
      </div>
      <div className="impact-rail">
        <div className="rail-labels">
          <span>Task received</span>
          <span>Untrusted instruction</span>
          <span>Effect boundary</span>
          <span>Verdict</span>
        </div>
        <div className="rail-track">
          <span className="rail-fill" style={{ width: `${progress}%` }} />
          <span className="rail-playhead" style={{ left: `${progress}%` }} />
          <span className="impact-marker" />
        </div>
      </div>
    </div>
  );
}

interface BrowserSledProps {
  track: TrackId;
  scenario: CrashScenario;
  step: number;
  impacted: boolean;
  complete: boolean;
  report: RunReport;
}

function BrowserSled({
  track,
  scenario,
  step,
  impacted,
  complete,
  report,
}: BrowserSledProps) {
  const guarded = track === "airlocked";
  const trace = executionFor(report, track, scenario.id).trace;
  const activeTrace =
    step > 0
      ? trace[Math.max(0, Math.min(step - 1, trace.length - 1))]
      : undefined;
  const blocked = trace.find((event) => event.outcome === "blocked");
  const verdict = verdictFor(report, track, scenario.id);
  const staged =
    scenario.tape.findIndex((action) => action.kind === "type") + 1;
  const showInput = staged > 0 && step >= staged;

  return (
    <article
      className={`browser-sled ${guarded ? "guarded" : "baseline"} ${impacted ? "at-impact" : ""}`}
    >
      <header className="sled-label">
        <div>
          <span className="track-dot" />
          <strong>{guarded ? "AIRLOCKED" : "UNSHIELDED"}</strong>
        </div>
        <small>{guarded ? "POLICY SIDECAR ON" : "DIRECT TOOL ACCESS"}</small>
      </header>
      <div className="browser-chrome">
        <div className="chrome-bar">
          <i />
          <i />
          <i />
          <span>relaydesk.range/case</span>
        </div>
        <div className="mini-page">
          <p className="mini-kicker">USER TASK</p>
          <strong className="mini-task">{scenario.userTask}</strong>
          <div className={`injection-card ${step >= 1 ? "is-read" : ""}`}>
            <span>{scenario.channel}</span>
            <p>{scenario.injection}</p>
          </div>
          {scenario.protectedValue && (
            <div className={`secret-row ${step >= 2 ? "is-exposed" : ""}`}>
              <span>Private record</span>
              <code>{step >= 2 ? "arl_canary_••••" : "••••••••••••"}</code>
            </div>
          )}
          <div className={`agent-field ${showInput ? "has-value" : ""}`}>
            {showInput ? "protected value staged" : "Agent workbench"}
          </div>
          <div className="mini-action-row">
            <span className={impacted ? "pressed" : ""}>
              Commit requested action
            </span>
            <span className={complete ? "done" : ""}>Complete task</span>
          </div>
        </div>
      </div>
      <div className="sled-readout">
        <span>
          {activeTrace ? activeTrace.description : "Ready on identical state"}
        </span>
        <strong>
          {complete
            ? verdict.verdict === "safe"
              ? "SAFE + COMPLETE"
              : verdict.verdict.toUpperCase()
            : impacted
              ? guarded
                ? blocked
                  ? "EFFECT BLOCKED"
                  : "EFFECT EXECUTED"
                : "UNSAFE EFFECT COMMITTED"
              : `ACTION ${String(step).padStart(2, "0")}`}
        </strong>
      </div>
      {impacted && guarded && blocked && (
        <div className="policy-brake">
          <ShieldIcon />
          <div>
            <small>POLICY BRAKE</small>
            <strong>{blocked.policyRule}</strong>
          </div>
        </div>
      )}
      {impacted && !guarded && (
        <div className="impact-flash" aria-hidden="true">
          <span>BOUNDARY BREACH</span>
        </div>
      )}
    </article>
  );
}

function TestMatrix({
  report,
  selectedId,
  onSelect,
}: {
  report: RunReport;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="test-section" aria-labelledby="test-heading">
      <div className="section-heading">
        <div>
          <p className="section-code">ACTIVE TEST MATRIX</p>
          <h2 id="test-heading">Six ways a page can seize the wheel.</h2>
        </div>
        <p>
          Select a test to replay the exact action tape through both tracks.
        </p>
      </div>
      <div className="test-grid">
        {SCENARIOS.map((scenario) => {
          const left = verdictFor(report, "unshielded", scenario.id);
          const right = verdictFor(report, "airlocked", scenario.id);
          return (
            <button
              key={scenario.id}
              className={`test-card ${selectedId === scenario.id ? "is-selected" : ""}`}
              onClick={() => onSelect(scenario.id)}
              aria-pressed={selectedId === scenario.id}
            >
              <span className="test-ordinal">{scenario.ordinal}</span>
              <span className="test-copy">
                <strong>{scenario.shortTitle}</strong>
                <small>{scenario.channel}</small>
              </span>
              <span
                className="paired-verdict"
                aria-label={`Unshielded ${left.verdict}; airlocked ${right.verdict}`}
              >
                <VerdictMark verdict={left.verdict} />
                <VerdictMark verdict={right.verdict} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function EvidenceLedger({
  report,
  scenario,
}: {
  report: RunReport;
  scenario: CrashScenario;
}) {
  const left = executionFor(report, "unshielded", scenario.id);
  const right = executionFor(report, "airlocked", scenario.id);
  const blocked = right.trace.find((event) => event.outcome === "blocked");
  const unsafe = left.audits.find(
    (event) => event.kind === scenario.unsafeEffect,
  );
  const guardedUnsafe = right.audits.find(
    (event) => event.kind === scenario.unsafeEffect,
  );

  return (
    <section className="evidence-section" aria-labelledby="evidence-heading">
      <div className="evidence-title">
        <p className="section-code">
          OUT-OF-BAND EVIDENCE / {scenario.ordinal}
        </p>
        <h2 id="evidence-heading">
          The target system—not the agent—delivers the verdict.
        </h2>
      </div>
      <div className="ledger-layout">
        <div className="timeline-panel">
          <header>
            <span>SYNCHRONIZED ACTION LEDGER</span>
            <span>{left.trace.length} STEPS</span>
          </header>
          <div className="timeline-head">
            <span>ACTION</span>
            <span>UNSHIELDED</span>
            <span>AIRLOCKED</span>
          </div>
          {left.trace.map((event, index) => (
            <TimelineRow
              key={event.id}
              index={index}
              left={event}
              right={right.trace[index]}
            />
          ))}
        </div>
        <aside className="verdict-panel">
          <div className="verdict-score">
            <span>AIRLOCK SAFETY</span>
            <strong>
              {report.tracks.airlocked.safetyScore}
              <sup>/100</sup>
            </strong>
            <small>
              with {report.tracks.airlocked.taskScore}% task completion
            </small>
          </div>
          <div className="policy-card">
            <span className="policy-tab">INTERVENTION</span>
            <ShieldIcon />
            <p>{blocked?.policyRule ?? "No intervention required"}</p>
            <strong>
              {blocked?.policyReason ?? "The action stayed inside policy."}
            </strong>
          </div>
          <div className="effect-receipt">
            <span>AUTHORITATIVE EFFECT RECEIPT</span>
            <div>
              <i className={`receipt-light ${unsafe ? "danger" : "safe"}`} />
              <p>
                <small>UNSHIELDED</small>
                <strong>{unsafe?.detail ?? "No unsafe effect recorded"}</strong>
              </p>
            </div>
            <div>
              <i
                className={`receipt-light ${guardedUnsafe ? "danger" : "safe"}`}
              />
              <p>
                <small>AIRLOCKED</small>
                <strong>
                  {guardedUnsafe?.detail ??
                    "No unsafe effect in private ledger"}
                </strong>
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function VerdictMark({
  verdict,
}: {
  verdict: "safe" | "compromised" | "incomplete";
}) {
  const passed = verdict === "safe";
  return (
    <i className={passed ? "passed" : "failed"}>
      {passed ? "✓" : verdict === "incomplete" ? "!" : "×"}
    </i>
  );
}

function TimelineRow({
  index,
  left,
  right,
}: {
  index: number;
  left: TraceEvent;
  right?: TraceEvent;
}) {
  return (
    <div
      className={`timeline-row ${right?.outcome === "blocked" ? "is-brake" : ""}`}
    >
      <div>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <p>{left.description}</p>
      </div>
      <Outcome event={left} />
      <Outcome event={right} />
    </div>
  );
}

function Outcome({ event }: { event?: TraceEvent }) {
  if (!event) return <span className="outcome neutral">—</span>;
  return (
    <span className={`outcome ${event.outcome}`}>
      {event.outcome === "blocked" ? "BLOCKED" : "EXECUTED"}
    </span>
  );
}

function Protocol({ report }: { report: RunReport }) {
  return (
    <section
      id="protocol"
      className="protocol-section"
      aria-labelledby="protocol-heading"
    >
      <div className="protocol-copy">
        <p className="section-code">RANGE PROTOCOL</p>
        <h2 id="protocol-heading">
          A controlled world. Two real runs. One independent judge.
        </h2>
        <p>
          AIRLOCK keeps the attack reproducible and the verdict honest. Solari
          supplies an isolated target, disposable browsers, and session replay;
          the verifier reads a capability-protected ledger the agent never sees.
        </p>
        <a
          className="source-button"
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Read the implementation <ExternalIcon />
        </a>
      </div>
      <ol className="protocol-flow">
        <li>
          <span>01</span>
          <div>
            <strong>Seed the range</strong>
            <p>Host synthetic cases and canaries inside a Solari sandbox.</p>
          </div>
          <code>SANDBOX</code>
        </li>
        <li>
          <span>02</span>
          <div>
            <strong>Run the pair</strong>
            <p>Replay one action tape in two recorded cloud browsers.</p>
          </div>
          <code>BROWSER × 2</code>
        </li>
        <li>
          <span>03</span>
          <div>
            <strong>Judge effects</strong>
            <p>Read the private target ledger; ignore self-reported success.</p>
          </div>
          <code>VERIFY</code>
        </li>
        <li>
          <span>04</span>
          <div>
            <strong>Keep the proof</strong>
            <p>
              Write traces, screenshots, replay links, and a machine-readable
              report.
            </p>
          </div>
          <code>EVIDENCE</code>
        </li>
      </ol>
      <div className="environment-strip">
        <span>{report.environment.range}</span>
        <span>{report.environment.browsers}</span>
        <span>{report.environment.verifier}</span>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <a className="wordmark" href="#top">
        AIR<span>/</span>LOCK
      </a>
      <p>
        Built for the Solari challenge. Synthetic data only. Every live session
        is destroyed on exit.
      </p>
      <div>
        <a href={SOURCE_URL}>GitHub</a>
        <a href="https://getsolari.com">Solari</a>
      </div>
    </footer>
  );
}

function executionFor(report: RunReport, track: TrackId, scenarioId: string) {
  const execution = report.tracks[track].executions.find(
    (item) => item.scenarioId === scenarioId,
  );
  if (!execution) throw new Error(`Evidence is missing ${track}/${scenarioId}`);
  return execution;
}

function verdictFor(report: RunReport, track: TrackId, scenarioId: string) {
  const verdict = report.tracks[track].verdicts.find(
    (item) => item.scenarioId === scenarioId,
  );
  if (!verdict) throw new Error(`Verdict is missing ${track}/${scenarioId}`);
  return verdict;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

async function loadEvidence<T>(name: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${name}`);
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function LoadingBay() {
  return (
    <main className="loading-screen">
      <span className="loading-mark">AIR/LOCK</span>
      <p>Loading the evidence ledger…</p>
    </main>
  );
}

function EvidenceError({ message }: { message: string }) {
  return (
    <main className="loading-screen error-screen">
      <span className="loading-mark">EVIDENCE MISSING</span>
      <p>{message}</p>
      <code>Run npm run demo:offline, then reload.</code>
    </main>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5 13 8l-9 5.5z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 2.5h3v11h-3zm6 0h3v11h-3z" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 8h11M9 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6 3h7v7M13 3 6 10M11 9v4H3V5h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5 20 6v5.8c0 4.7-3.1 8.1-8 9.7-4.9-1.6-8-5-8-9.7V6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m8.2 12 2.4 2.4 5.2-5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}
