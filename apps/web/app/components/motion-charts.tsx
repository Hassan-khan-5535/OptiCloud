'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { formatCurrency, type Finding, type Policy } from '../lib/api';

type ChartPoint = { x: number; y: number; label: string; value: number };
type Range = '30D' | '90D' | '1Y';

type MotionChartsProps = {
  findings: Finding[];
  policies: Policy[];
  detectedMonthlyWasteCents: number;
  remediatedToDateCents: number;
};

const RANGE_DAYS: Record<Range, number> = { '30D': 30, '90D': 90, '1Y': 365 };
const CHART_WIDTH = 672;
const CHART_HEIGHT = 188;
const CHART_PADDING = 12;

function replay(setKey: (value: number) => void) {
  setKey(Date.now());
}

function toChartPoints(findings: Finding[], range: Range): ChartPoint[] {
  const cutoff = Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  const recent = findings
    .filter((finding) => finding.updatedAt && new Date(finding.updatedAt).getTime() >= cutoff)
    .sort((left, right) => new Date(left.updatedAt ?? 0).getTime() - new Date(right.updatedAt ?? 0).getTime())
    .slice(-7);
  const values = recent.length > 0 ? recent.map((finding) => finding.estimatedMonthlySavingsCents) : [0];
  const max = Math.max(...values, 1);
  const step = values.length === 1 ? 0 : (CHART_WIDTH - CHART_PADDING * 2) / (values.length - 1);
  return values.map((value, index) => ({
    x: CHART_PADDING + index * step,
    y: CHART_HEIGHT - CHART_PADDING - (value / max) * (CHART_HEIGHT - CHART_PADDING * 2),
    label: recent[index]?.updatedAt ? new Date(recent[index].updatedAt as string).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : 'No data',
    value,
  }));
}

function pathFor(points: ChartPoint[]): string {
  if (points.length === 0) return `M0 ${CHART_HEIGHT - CHART_PADDING}`;
  if (points.length === 1) return `M${points[0].x} ${points[0].y} L${points[0].x} ${points[0].y}`;
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
}

function areaFor(points: ChartPoint[]): string {
  const line = pathFor(points);
  const first = points[0] ?? { x: 0 };
  const last = points.at(-1) ?? { x: CHART_WIDTH };
  return `${line} L${last.x} ${CHART_HEIGHT - CHART_PADDING} L${first.x} ${CHART_HEIGHT - CHART_PADDING} Z`;
}

export function MotionCharts({ findings, policies, detectedMonthlyWasteCents, remediatedToDateCents }: MotionChartsProps) {
  const [replayKey, setReplayKey] = useState(0);
  const [range, setRange] = useState<Range>('30D');
  const replayAll = useCallback(() => replay(setReplayKey), []);
  const points = useMemo(() => toChartPoints(findings, range), [findings, range]);
  const linePath = pathFor(points);
  const areaPath = areaFor(points);
  const livePolicies = policies.filter((policy) => policy.active).length;
  const automationCoverage = policies.length === 0 ? 0 : Math.round((livePolicies / policies.length) * 100);
  const totalTrackedSavings = detectedMonthlyWasteCents + remediatedToDateCents;
  const recoveryRate = totalTrackedSavings === 0 ? 0 : Math.round((remediatedToDateCents / totalTrackedSavings) * 100);

  return (
    <section className="motion-dashboard" aria-label="Cloud efficiency charts">
      <div className="motion-panel motion-line-panel">
        <div className="motion-panel-head">
          <div><h2>Savings signal</h2><p>Live indexed view of findings updated in the selected window</p></div>
          <div className="motion-range" role="group" aria-label="Chart range">
            {(Object.keys(RANGE_DAYS) as Range[]).map((item) => (
              <button key={item} type="button" className={range === item ? 'active' : ''} aria-pressed={range === item} onClick={() => { setRange(item); replayAll(); }}>{item}</button>
            ))}
          </div>
        </div>
        <svg key={`line-${replayKey}-${range}`} className="motion-line-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`Savings signal for ${range}; current detected waste is ${formatCurrency(detectedMonthlyWasteCents)}`}>
          <defs><linearGradient id="cindrMotionArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--motion-violet)" stopOpacity=".32" /><stop offset="1" stopColor="var(--motion-violet)" stopOpacity="0" /></linearGradient></defs>
          <path className="motion-area" d={areaPath} />
          <path className="motion-line" d={linePath} />
          {points.map((point, index) => <circle key={`${point.x}-${point.y}`} className="motion-point" style={{ '--point-delay': `${620 + index * 80}ms` } as CSSProperties} cx={point.x} cy={point.y} r="5"><title>{point.label}: {formatCurrency(point.value)} estimated savings</title></circle>)}
        </svg>
        <div className="motion-chart-labels" aria-hidden="true">{points.map((point) => <span key={`${point.x}-label`}>{point.label}</span>)}</div>
      </div>

      <div className="motion-panel motion-gauge-panel">
        <div className="motion-panel-head"><div><h2>Remediation health</h2><p>Live policy and savings-recovery indicators</p></div><button type="button" className="motion-replay" onClick={replayAll}>Replay</button></div>
        <div className="motion-gauges" key={`gauges-${replayKey}`}>
          <Gauge value={automationCoverage} label="Policy coverage" detail={`${livePolicies} live of ${policies.length} total`} color="var(--motion-violet)" />
          <Gauge value={recoveryRate} label="Savings recovered" detail={`${formatCurrency(remediatedToDateCents)} recovered to date`} color="var(--motion-lime)" />
        </div>
      </div>
    </section>
  );
}

function Gauge({ value, label, detail, color }: { value: number; label: string; detail: string; color: string }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - value / 100);
  return (
    <article className="motion-gauge" style={{ '--gauge-color': color, '--gauge-offset': `${offset}px` } as CSSProperties}>
      <svg viewBox="0 0 140 140" role="img" aria-label={`${label}: ${value}%`}><circle className="motion-gauge-track" cx="70" cy="70" r="54" /><circle className="motion-gauge-value" cx="70" cy="70" r="54" /></svg>
      <div className="motion-gauge-center"><strong>{value}%</strong><span>status</span></div>
      <div className="motion-gauge-copy"><b>{label}</b><span>{detail}</span></div>
    </article>
  );
}
