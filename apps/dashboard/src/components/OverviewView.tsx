import { useEffect, useState } from 'react';
import type { Overview } from '@aura/contract';
import { fetchOverview } from '../api.js';
import { relativeTime } from './time.js';

/** Map a raw activity/job status to a semantic colour class. */
function statusTone(status: string): 'ok' | 'failed' | 'dispatched' | 'queued' {
  const s = status.toLowerCase();
  if (['done', 'ok', 'success', 'succeeded', 'completed'].includes(s)) return 'ok';
  if (['failed', 'error', 'errored'].includes(s)) return 'failed';
  if (['dispatched', 'running', 'active', 'in_progress'].includes(s)) return 'dispatched';
  return 'queued';
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function OverviewView() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    fetchOverview().then(setData).catch(console.error);
  }, []);

  return (
    <>
      <div className="aura-top">
        <h3>Overview</h3>
      </div>
      <div className="aura-scroll">
        {!data ? (
          <div className="ov-loading muted">Loading…</div>
        ) : (
          <div className="ov-grid">
            <div className="stat-row">
              <StatCard label="Leads" value={data.counts.leads} />
              <StatCard
                label="Campaigns"
                value={data.counts.campaigns}
                sub={`${data.counts.runningCampaigns} running`}
              />
              <StatCard label="Active enrollments" value={data.counts.activeEnrollments} />
              <StatCard label="Done" value={data.counts.doneEnrollments} />
            </div>

            <section className="ov-section">
              <div className="ov-section-title">Daily caps</div>
              {data.caps.length === 0 ? (
                <div className="ov-empty muted">No action caps configured.</div>
              ) : (
                <div className="caps-list">
                  {data.caps.map((c) => {
                    const pct = c.cap > 0 ? Math.min(100, (c.used / c.cap) * 100) : 0;
                    const near = pct >= 90;
                    return (
                      <div className="cap-row" key={c.action}>
                        <div className="cap-head">
                          <span className="cap-label">{c.action}</span>
                          <span className="cap-count">
                            {c.used} / {c.cap}
                          </span>
                        </div>
                        <div className="cap-track">
                          <div
                            className={`cap-fill${near ? ' cap-fill--near' : ''}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="ov-section">
              <div className="ov-section-title">Recent activity</div>
              {data.recentActivity.length === 0 ? (
                <div className="ov-empty muted">No activity yet.</div>
              ) : (
                <div className="activity-list">
                  {data.recentActivity.map((a) => (
                    <div className="activity-row" key={a.jobId}>
                      <span className="activity-type">{a.type}</span>
                      <span className="activity-target" title={a.target}>
                        {a.target}
                      </span>
                      <span className={`status-dot status-${statusTone(a.status)}`}>
                        {a.status}
                      </span>
                      <span className="activity-time muted">{relativeTime(a.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
