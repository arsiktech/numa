import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import "./video.css";

const metrics = [
  { label: "Net worth", value: "$41,245", color: "#2f9d88" },
  { label: "Assets", value: "$79,660", color: "#8177f2" },
  { label: "Cashflow", value: "$4,990", color: "#3478f6" },
  { label: "Liabilities", value: "$22,900", color: "#ef6f7b" }
];

const rows = [
  ["AAPL", "Apple", "$4,522", "+1.8%"],
  ["VOO", "S&P 500 ETF", "$15,075", "+0.7%"],
  ["BTC", "Bitcoin", "$28,736", "+2.4%"],
  ["ETH", "Ethereum", "$12,692", "-0.9%"]
];

export function NumaLaunch() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const heroIn = spring({ frame, fps, config: { damping: 22, stiffness: 95 } });
  const dashboardIn = spring({ frame: frame - 34, fps, config: { damping: 24, stiffness: 90 } });
  const outro = interpolate(frame, [160, 205], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill className="numa-video">
      <div className="video-bg" />
      <section
        className="video-copy"
        style={{
          opacity: interpolate(frame, [0, 24], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(heroIn, [0, 1], [38, 0])}px)`
        }}
      >
        <div className="video-brand">
          <span>N</span>
          <strong>Numa Pro</strong>
        </div>
        <h1>Your capital, clearly.</h1>
        <p>Personal wealth, shared portfolios, cashflow, assets, and liabilities in one living capital system.</p>
      </section>

      <section
        className="video-dashboard"
        style={{
          opacity: dashboardIn,
          transform: `translateY(${interpolate(dashboardIn, [0, 1], [80, 0])}px) scale(${interpolate(dashboardIn, [0, 1], [0.96, 1])})`
        }}
      >
        <div className="video-sidebar">
          <strong>Numa Pro</strong>
          <span>Overview</span>
          <span>Cashflow</span>
          <span>Assets</span>
          <span>Shared</span>
        </div>
        <div className="video-main">
          <div className="video-topline">
            <span>Personal</span>
            <span>Monthly</span>
            <b>Live markets</b>
          </div>
          <div className="video-wealth">
            <p>Net worth</p>
            <h2>$41,245</h2>
            <div className="video-line">
              <span />
            </div>
          </div>
          <div className="video-metrics">
            {metrics.map((metric, index) => (
              <div className="video-metric" key={metric.label} style={{ "--metric": metric.color, animationDelay: `${0.35 + index * 0.08}s` } as CSSProperties}>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
          <div className="video-table">
            {rows.map((row) => (
              <div className="video-row" key={row[0]}>
                <b>{row[0]}</b>
                <span>{row[1]}</span>
                <strong>{row[2]}</strong>
                <em className={row[3].startsWith("+") ? "gain" : "loss"}>{row[3]}</em>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="video-outro" style={{ opacity: outro }}>
        <h2>Know your worth.</h2>
        <p>The home for your net worth.</p>
      </div>
    </AbsoluteFill>
  );
}
