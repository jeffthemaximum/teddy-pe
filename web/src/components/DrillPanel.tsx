import type { Drill } from "@teddy-pe/core";

// One drill, full detail. Teddy looks here for the cue and what it looks
// like; Jeff looks here for what to watch. Both need all four fields on
// screen at once, not a click apart, which is why this is dense rather than
// tucked behind its own tabs.
//
// Every word here comes off the `drill` prop, straight from the API. Nothing
// about any one drill is written into this file, so the bundle-privacy test
// (a real drill name baked into JSX) has nothing to catch here.
export function DrillPanel({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const stepsLabel = `${drill.name} steps`;

  return (
    <section aria-labelledby="drill-panel-heading" className="drill-panel">
      <button type="button" onClick={onClose}>
        Back to the list
      </button>

      <h2 id="drill-panel-heading">{drill.name}</h2>
      <p className="drill-panel__area">{drill.area_name}</p>
      <p className="drill-panel__cue">{drill.cue}</p>
      {drill.short && <p className="drill-panel__short">{drill.short}</p>}

      <ol aria-label={stepsLabel} className="drill-panel__steps">
        {drill.how.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>

      <p className="drill-panel__watch">
        <strong>Watch for:</strong> {drill.watch}
      </p>
    </section>
  );
}
