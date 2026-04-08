import React, { useRef } from "react";
import {
  computeExpenseBreakdown,
  VENUE_SIZE_OPTIONS,
  PACING_OPTIONS,
  TRANSPORT_TIERS,
  TICKET_SELL_TYPES,
} from "@/lib/tourWizardModel";
import { formatCurrency } from "@/utils/numberFormat";
import { Loader2 } from "lucide-react";

// ─── Section helper ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <p
        className="text-[10px] font-black uppercase tracking-widest"
        style={{ color: "#6b7280" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── ReviewRow ───────────────────────────────────────────────────────────────

function ReviewRow({ label, value, valueColor }) {
  if (value === null || value === undefined) return null;
  return (
    <div
      className="flex items-center justify-between py-2.5"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <span className="text-xs" style={{ color: "#9ca3af" }}>
        {label}
      </span>
      <span className="text-xs font-bold" style={{ color: valueColor || "#ffffff" }}>
        {value}
      </span>
    </div>
  );
}

// ─── Tour Mode Labels ────────────────────────────────────────────────────────

const TOUR_MODE_LABELS = {
  solo: "Solo",
  equal_coheadliner: "Co-Headliner",
  partner_led: "Partner-Led",
};

function buildPosterEyebrow({ categoryName, routeCount }) {
  if (categoryName) return categoryName;
  if (routeCount > 1) return "Tour Announcement";
  return "Live Run";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WizardStepReview({
  wizardPlan,
  setWizardPlan,
  profile: _profile,
  routeBuilderDraft,
  routeBuilderSequence,
  categories,
  onLaunch,
  submitting,
  canLaunch,
}) {
  const fileInputRef = useRef(null);

  // ── Lookups ──────────────────────────────────────────────────────────────
  const venueLabel =
    VENUE_SIZE_OPTIONS.find((v) => v.id === wizardPlan.venueSize)?.label || "—";
  const pacingLabel =
    PACING_OPTIONS.find((p) => p.id === wizardPlan.strategy?.pacing)?.label || "—";
  const transportLabel =
    TRANSPORT_TIERS.find((t) => t.id === wizardPlan.transportTier)?.label || "—";

  // ── Expense breakdown ────────────────────────────────────────────────────
  const categoryConfig = categories?.find((c) => c.id === wizardPlan.category?.id);
  const expenses = computeExpenseBreakdown(wizardPlan, routeBuilderDraft, categoryConfig);

  // ── Enabled sell types ───────────────────────────────────────────────────
  const enabledSellTypes = TICKET_SELL_TYPES.filter((st) =>
    wizardPlan.ticketSellTypes?.includes(st.id)
  );
  const posterEyebrow = buildPosterEyebrow({
    categoryName: wizardPlan.category?.name,
    routeCount: routeBuilderSequence?.length || 0,
  });
  const posterSupportLines = [
    venueLabel !== "—" ? venueLabel : null,
    TOUR_MODE_LABELS[wizardPlan.tourMode] || null,
    transportLabel !== "—" ? transportLabel : null,
  ].filter(Boolean);
  const posterCities = (routeBuilderDraft?.routeRegions || [])
    .flatMap((region) => region.cityStops || [])
    .map((stop) => stop.cityName)
    .filter(Boolean)
    .slice(0, 6);
  const posterRouteLine = posterCities.length > 0
    ? posterCities.join(" · ")
    : `${routeBuilderDraft?.stopCount || 0} stops across ${routeBuilderSequence?.length || 0} regions`;

  return (
    <div className="space-y-6">
      {/* ── 1. Tour Name Input ──────────────────────────────────────────────── */}
      <Section title="Tour Name">
        <input
          type="text"
          value={wizardPlan.tourName}
          onChange={(e) =>
            setWizardPlan((p) => ({ ...p, tourName: e.target.value }))
          }
          placeholder="Name your tour..."
          maxLength={100}
          className="w-full px-4 py-3 rounded-2xl text-sm font-bold text-white placeholder-gray-600 outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: wizardPlan.tourName.trim()
              ? "1px solid rgba(139,92,246,0.4)"
              : "1px solid rgba(255,255,255,0.08)",
          }}
        />
      </Section>

      {/* ── 2. Tour Summary Table ───────────────────────────────────────────── */}
      <Section title="Tour Summary">
        <div
          className="rounded-2xl px-4 py-1"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <ReviewRow
            label="Tour Category"
            value={wizardPlan.category?.name || "—"}
          />
          <ReviewRow label="Venue Size" value={venueLabel} />
          <ReviewRow
            label="Tour Mode"
            value={TOUR_MODE_LABELS[wizardPlan.tourMode] || "Solo"}
          />
          <ReviewRow label="Schedule Pacing" value={pacingLabel} />
          <ReviewRow label="Transport" value={transportLabel} />
          <ReviewRow
            label="Songs in Setlist"
            value={wizardPlan.selectedSongs.length}
          />
          <ReviewRow
            label="Route"
            value={`${routeBuilderDraft?.stopCount || 0} stops, ${routeBuilderSequence?.length || 0} regions`}
          />
          <ReviewRow
            label="Start Date"
            value={`In ${wizardPlan.startDateOffset} turn(s)`}
          />
          <ReviewRow
            label="Crew"
            value={`${wizardPlan.crew.length} hired`}
          />
          <ReviewRow
            label="Opening Acts"
            value={`${wizardPlan.openingActs.length} booked`}
          />
          <ReviewRow
            label="Co-Headliner"
            value={wizardPlan.coHeadliner?.artist_name || "None"}
          />
          <ReviewRow
            label="Sponsor"
            value={wizardPlan.sponsor?.brand_name || "None"}
          />
        </div>
      </Section>

      {/* ── 3. Expense Breakdown ────────────────────────────────────────────── */}
      <Section title="Expense Breakdown">
        <div
          className="rounded-2xl px-4 py-1"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <ReviewRow label="Venue Costs" value={formatCurrency(expenses.venue)} />
          <ReviewRow label="Crew Salaries" value={formatCurrency(expenses.crew)} />
          <ReviewRow label="Transport" value={formatCurrency(expenses.transport)} />
          <ReviewRow label="Production" value={formatCurrency(expenses.production)} />
          <ReviewRow
            label="Total"
            value={formatCurrency(expenses.total)}
            valueColor="#a78bfa"
          />
        </div>
      </Section>

      {/* ── 4. Ticket Pricing Summary ───────────────────────────────────────── */}
      <Section title="Ticket Pricing">
        <div
          className="rounded-2xl px-4 py-1"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <ReviewRow
            label="GA"
            value={`$${wizardPlan.ticketTiers?.ga ?? 0}`}
          />
          <ReviewRow
            label="Reserved"
            value={`$${wizardPlan.ticketTiers?.reserved ?? 0}`}
          />
          <ReviewRow
            label="VIP"
            value={`$${wizardPlan.ticketTiers?.vip ?? 0}`}
          />
          <ReviewRow
            label="Meet & Greet"
            value={`$${wizardPlan.ticketTiers?.meet_greet ?? 0}`}
          />
        </div>

        {enabledSellTypes.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {enabledSellTypes.map((st) => (
              <span
                key={st.id}
                className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: "rgba(139,92,246,0.12)",
                  color: "#c4b5fd",
                  border: "1px solid rgba(139,92,246,0.25)",
                }}
              >
                {st.label}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* ── 5. Schedule Notice ──────────────────────────────────────────────── */}
      {wizardPlan.startDateOffset > 1 ? (
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "rgba(96,165,250,0.08)",
            border: "1px solid rgba(96,165,250,0.2)",
          }}
        >
          <p className="text-xs font-bold" style={{ color: "#93c5fd" }}>
            Tour launches in {wizardPlan.startDateOffset} turns. You'll be in
            prep mode until then.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: "rgba(52,211,153,0.08)",
            border: "1px solid rgba(52,211,153,0.2)",
          }}
        >
          <p className="text-xs font-bold" style={{ color: "#6ee7b7" }}>
            Tour starts next turn!
          </p>
        </div>
      )}

      {/* ── 6. Tour Poster ──────────────────────────────────────────────────── */}
      <Section title="Tour Poster">
        <div className="mx-auto max-w-[430px]">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(180deg, #08070f 0%, #181126 34%, #34175f 100%)",
              border: "1px solid rgba(139,92,246,0.22)",
            }}
          >
            <div className="min-h-[560px] px-6 py-7 md:px-8 md:py-8 flex flex-col">
              <div>
                <p
                  className="text-[9px] font-medium uppercase tracking-[0.3em]"
                  style={{ color: "rgba(216,180,254,0.72)" }}
                >
                  {posterEyebrow}
                </p>
                <p
                  className="mt-4 text-[32px] md:text-[38px] font-semibold uppercase leading-[0.92] text-white"
                  style={{ letterSpacing: "-0.05em", textShadow: "0 8px 30px rgba(0,0,0,0.4)" }}
                >
                  {wizardPlan.tourName || "Untitled Tour"}
                </p>

                <div className="mt-8 space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.22em]" style={{ color: "rgba(255,255,255,0.48)" }}>
                    {routeBuilderDraft?.stopCount || 0} Stops Across {routeBuilderSequence?.length || 0} Regions
                  </p>
                  <p className="text-[15px] md:text-[16px] font-medium leading-relaxed" style={{ color: "rgba(255,255,255,0.95)" }}>
                    {posterRouteLine}
                  </p>
                </div>
              </div>

              <div className="mt-auto pt-10 space-y-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.62)" }}>
                  Launches in {wizardPlan.startDateOffset} turn{wizardPlan.startDateOffset === 1 ? "" : "s"}
                </p>

                {posterSupportLines.length > 0 && (
                  <p className="text-[10px] uppercase tracking-[0.18em] leading-relaxed" style={{ color: "rgba(255,255,255,0.46)" }}>
                    {posterSupportLines.join(" · ")}
                  </p>
                )}

                {(wizardPlan.sponsor?.brand_name || wizardPlan.coHeadliner?.artist_name) && (
                  <p className="text-[10px] uppercase tracking-[0.18em] leading-relaxed" style={{ color: "rgba(216,180,254,0.76)" }}>
                    {wizardPlan.sponsor?.brand_name ? `Presented with ${wizardPlan.sponsor.brand_name}` : ""}
                    {wizardPlan.sponsor?.brand_name && wizardPlan.coHeadliner?.artist_name ? " · " : ""}
                    {wizardPlan.coHeadliner?.artist_name ? `Featuring ${wizardPlan.coHeadliner.artist_name}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {wizardPlan.posterUrl && (
          <p className="text-[10px] mt-1" style={{ color: "#6b7280" }}>
            Custom poster: {wizardPlan.posterUrl}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setWizardPlan((p) => ({ ...p, posterUrl: file.name }));
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 rounded-2xl text-[11px] font-bold uppercase tracking-wider text-white/50 transition-colors hover:text-white/70"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Upload Custom Poster
        </button>
      </Section>

      {/* ── 7. Launch Button ────────────────────────────────────────────────── */}
      <button
        onClick={onLaunch}
        disabled={submitting || !canLaunch}
        className="w-full py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest text-white transition-all disabled:opacity-30"
        style={{
          background: canLaunch
            ? "linear-gradient(135deg, #7c3aed, #db2777)"
            : "rgba(255,255,255,0.06)",
        }}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Launching...
          </span>
        ) : (
          "Launch Tour"
        )}
      </button>
    </div>
  );
}
