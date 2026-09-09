import { useEffect } from "react";
import { actions, modName, useAppState } from "../state/store";
import type { Severity, ValidationIssue } from "../types";

const ORDER: Severity[] = ["error", "warning", "info"];

export function Validate() {
  const s = useAppState();
  const report = s.report;

  useEffect(() => {
    if (!report && !s.validating) void actions.validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = ORDER.map((sev) => ({ sev, issues: (report?.issues ?? []).filter((i) => i.severity === sev) }));
  const missing = report?.requiredDownloads.filter((r) => !r.found) ?? [];

  return (
    <section className="page page-narrow">
      <h1>Validation</h1>
      <p className="lead">ModSync performs a full dry run against a virtual copy of your game folder: every instruction of every selected mod is simulated.</p>
      <div className="row gap">
        <button className="btn btn-primary" disabled={s.validating} onClick={() => actions.validate()}>
          {s.validating ? "Validating…" : "Run validation again"}
        </button>
        {report && (
          <span className={`pill ${report.ok ? "pill-ok" : "pill-error"}`}>{report.ok ? "Ready to install" : "Errors must be fixed before installing"}</span>
        )}
      </div>
      {s.validating && <div className="progress indeterminate"><div className="progress-bar" /></div>}
      {report && (
        <>
          {grouped.map(
            (g) =>
              g.issues.length > 0 && (
                <div key={g.sev} className="card">
                  <h3>
                    {g.sev === "error" ? "Errors" : g.sev === "warning" ? "Warnings" : "Information"} <span className="muted">({g.issues.length})</span>
                  </h3>
                  {g.issues.map((i, idx) => (
                    <IssueRow key={idx} issue={i} />
                  ))}
                </div>
              ),
          )}
          {report.issues.length === 0 && <div className="alert alert-success">No issues found.</div>}
          <div className="card">
            <h3>
              Required downloads <span className="muted">({report.requiredDownloads.length - missing.length} found, {missing.length} missing)</span>
            </h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Mod</th>
                  <th>File pattern</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.requiredDownloads.map((r, idx) => (
                  <tr key={idx} className={r.found ? "" : "row-missing"}>
                    <td>{r.modName}</td>
                    <td className="mono small">{r.pattern}</td>
                    <td>
                      {r.found ? (
                        <span className="pill pill-ok" title={r.matchedFiles.join(", ")}>
                          found
                        </span>
                      ) : (
                        <span className="row gap">
                          <span className="pill pill-error">missing</span>
                          {!s.spoilerFree &&
                            r.links.slice(0, 1).map((l) => (
                              <button key={l} className="btn btn-sm" onClick={() => actions.openExternal(l)}>
                                Open link
                              </button>
                            ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Install order</h3>
            <ol className="small">
              {report.installOrder.map((g) => (
                <li key={g}>{modName(s, g)}</li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const s = useAppState();
  return (
    <div className={`issue issue-${issue.severity}`}>
      <span className="issue-code mono">{issue.code}</span>
      <span className="grow">
        {issue.modGuid && <strong>{modName(s, issue.modGuid)}: </strong>}
        {issue.message}
        {issue.path && <span className="muted mono small"> ({issue.path})</span>}
      </span>
    </div>
  );
}
