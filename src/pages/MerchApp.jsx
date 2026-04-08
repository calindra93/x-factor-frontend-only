import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ImageUpload from "@/components/ui/ImageUpload";
import {
  ChevronLeft,
  CircleDollarSign,
  Package,
  Sparkles,
  TrendingUp,
  RotateCcw,
  Flame,
  Boxes,
  X,
  AlertTriangle,
  Clock,
  Zap,
  Play,
} from "lucide-react";
import "@/components/merchapp/merchApp.css";
import { EDITION_TYPES, QUALITY_TIERS } from "@/components/merchapp/merchAppData";
import { SOURCING_TIERS, LIFECYCLE_DEFAULTS } from "@/components/merch/merchConfig";

// ─── constants ────────────────────────────────────────────────────────────────

const MERCH_TYPES_LIST = [
  "T-Shirt", "Hoodie", "Hat", "Poster", "Vinyl", "CD",
  "Cassette", "Sneakers", "Perfume", "Tote Bag", "Beanie", "Snapback", "Mug",
];

// Import MERCH_TYPES config for production costs
const MERCH_TYPES = {
  "T-Shirt": { baseCost: 5 },
  "Hoodie": { baseCost: 12 },
  "Hat": { baseCost: 4 },
  "Poster": { baseCost: 1 },
  "Vinyl": { baseCost: 8 },
  "CD": { baseCost: 2 },
  "Cassette": { baseCost: 1 },
  "Sneakers": { baseCost: 25 },
  "Perfume": { baseCost: 10 },
  "Tote Bag": { baseCost: 3 },
  "Beanie": { baseCost: 3 },
  "Snapback": { baseCost: 4 },
  "Mug": { baseCost: 2 },
};

const MERCH_ICONS = {
  "T-Shirt": "👕", "Hoodie": "🧥", "Hat": "🧢", "Poster": "🖼️",
  "Vinyl": "🎙️", "CD": "💿", "Cassette": "📼", "Sneakers": "👟",
  "Perfume": "💐", "Tote Bag": "👜", "Beanie": "🎿", "Snapback": "🧢", "Mug": "☕",
};

const WIZARD_STEPS = ["Type", "Edition", "Pricing", "Review"];

const DEFAULT_FORM = {
  type: "T-Shirt",
  name: "",
  linkedRelease: "",
  edition: "Standard",
  qualityTier: "Standard",
  sourcingTier: "Standard",
  unitPrice: 40,
  stock: 100,
  restockMode: "none",
  targetOnHand: 100,
  restockBatch: 50,
  restockIntervalTurns: 1,
  maxTotalUnits: "",
  imageUrl: "",
};

const SELL_BAR_COLOR = (pct) => {
  if (pct >= 0.75) return "var(--green)";
  if (pct >= 0.4) return "var(--gold)";
  return "var(--red)";
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function getCardGradient(edition) {
  if (edition === "Exclusive") return "linear-gradient(160deg, #1F1608 0%, #130D04 50%, #1C1308 100%)";
  if (edition === "Limited") return "linear-gradient(160deg, #18102A 0%, #0D0817 50%, #160D24 100%)";
  return "linear-gradient(160deg, #141420 0%, #0D0D15 50%, #111120 100%)";
}

function normalizeMerch(item) {
  const stock = Number(item.stock ?? 0);
  const sold = Number(item.units_sold ?? item.total_units_sold ?? 0);
  const qualityScore = Number(item.quality_score ?? item.quality ?? 70);
  const maxActiveTurns = item.max_active_turns ? Number(item.max_active_turns) : null;
  const activeTurnsCount = Number(item.active_turns_count ?? 0);
  
  // Normalize status: Archived/Sold Out → Retired for display
  let displayStatus = item.status ?? "Active";
  if (displayStatus === "Archived" || displayStatus === "Sold Out") {
    displayStatus = "Retired";
  }
  
  return {
    id: item.id,
    name: item.name || item.project_name || "Untitled Drop",
    type: item.merch_type ?? "T-Shirt",
    edition: item.edition ?? "Standard",
    qualityTier: item.quality_tier ?? null,
    qualityScore,
    unitPrice: Number(item.price_per_unit ?? 0),
    stock,
    sold,
    revenue: Number(item.total_revenue ?? 0),
    status: displayStatus,
    imageUrl: item.cover_artwork_url ?? null,
    releaseId: item.release_id ?? item.linked_release_id ?? null,
    restockCount: Number(item.restock_count ?? 0),
    sourcingTier: item.sourcing_tier ?? "Standard",
    restockMode: item.restock_mode ?? "none",
    targetOnHand: Number(item.target_on_hand ?? 0),
    restockBatch: Number(item.restock_batch ?? 50),
    selloutAchieved: item.sellout_achieved ?? false,
    controversyTriggered: item.controversy_triggered ?? false,
    maxActiveTurns,
    activeTurnsCount,
    turnsLeft: maxActiveTurns !== null ? Math.max(0, maxActiveTurns - activeTurnsCount) : null,
    raw: item,
  };
}

// Format large numbers to K/M/B/T notation
function formatCurrency(num) {
  const absNum = Math.abs(num);
  if (absNum >= 1e12) return `$${(num / 1e12).toFixed(1)}T`;
  if (absNum >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (absNum >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (absNum >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
}

// ─── MerchCard ────────────────────────────────────────────────────────────────

function MerchCard({ item, onOpen }) {
  const editionKey = item.edition?.toLowerCase() ?? "standard";
  const totalEver = item.sold + item.stock;
  const sellPct = totalEver > 0 ? item.sold / totalEver : 0;
  const icon = MERCH_ICONS[item.type] ?? "📦";

  return (
    <button
      className={`merch-card edition-${editionKey}`}
      onClick={() => onOpen(item)}
      aria-label={`Open ${item.name}`}
    >
      {/* Image / Placeholder */}
      <div
        className={`image-area ${item.imageUrl ? "" : "no-photo"} ${item.status === "Retired" ? "retired" : ""}`}
        style={item.imageUrl ? undefined : { background: getCardGradient(item.edition) }}
      >
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} />
        ) : (
          <span className="merch-icon">{icon}</span>
        )}

        {/* Edition badge — top right */}
        <div className="img-badges">
          <span className={`edition-badge ${editionKey}`}>{item.edition}</span>
        </div>

        {/* Status — top left */}
        <span
          className={`status-pill ${
            item.status === "Active" ? "active" : item.status === "Sold Out" ? "sold-out" : "retired"
          }`}
        >
          {item.status === "Active" ? "Live" : item.status === "Sold Out" ? "Sold Out" : "Archived"}
        </span>

        {/* Sellout banner */}
        {item.selloutAchieved && (
          <div className="sellout-banner">
            <Zap size={9} /> Sold Out
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="card-body">
        <div className="card-name">{item.name}</div>

        <div className="card-meta">
          <span className="card-type">{item.type}</span>
          <span className="card-price">${item.unitPrice}</span>
        </div>

        {/* Sell-through bar */}
        <div className="sell-bar">
          <div
            className="sell-bar-fill"
            style={{
              width: `${Math.min(sellPct * 100, 100)}%`,
              background: SELL_BAR_COLOR(sellPct),
            }}
          />
        </div>

        <div className="card-bottom">
          <span className="card-sold">{item.sold.toLocaleString()} sold</span>
          <span className="card-revenue">${item.revenue.toLocaleString()}</span>
        </div>

        {/* Sourcing + lifecycle strip */}
        <div className="card-footer">
          {item.sourcingTier !== "Standard" && (
            <span className={`sourcing-pill ${item.sourcingTier.toLowerCase()}`}>
              {SOURCING_TIERS[item.sourcingTier]?.icon} {item.sourcingTier}
            </span>
          )}
          {item.controversyTriggered && (
            <span className="sourcing-pill questionable">
              <AlertTriangle size={8} style={{ display: "inline" }} /> Scandal
            </span>
          )}
          {item.turnsLeft !== null && (
            <span className={`lifecycle-pill ${item.turnsLeft <= 3 ? "urgent" : ""}`}>
              <Clock size={8} />
              {item.turnsLeft}t
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── ActionSurface ────────────────────────────────────────────────────────────

function ActionSurface({ item, onClose, onRestock, onArchive, onUnarchive }) {
  if (!item) return null;
  const sourcingInfo = SOURCING_TIERS[item.sourcingTier] ?? SOURCING_TIERS.Standard;

  return (
    <>
      <button className="action-overlay" onClick={onClose} aria-label="Close" />
      <div className="action-surface" role="dialog" aria-modal="true">
        <div className="section-head" style={{ paddingBottom: 4 }}>
          <h3 className="action-title">{item.name}</h3>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Detail rows */}
        <div className="detail-block">
          <div className="detail-row">
            <span className="detail-key">Type</span>
            <span className="detail-val">{item.type} · {item.edition}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Price</span>
            <span className="detail-val">${item.unitPrice}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">In Stock</span>
            <span className="detail-val">{item.stock.toLocaleString()} units</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Sold</span>
            <span className="detail-val">{item.sold.toLocaleString()}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Revenue</span>
            <span className="detail-val" style={{ color: "var(--gold)" }}>
              ${item.revenue.toLocaleString()}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Sourcing</span>
            <span className="detail-val" style={{ color: item.sourcingTier === "Ethical" ? "var(--green)" : item.sourcingTier === "Questionable" ? "var(--gold)" : "var(--text-1)" }}>
              {sourcingInfo.icon} {item.sourcingTier}
            </span>
          </div>
          {item.restockMode === "auto" && (
            <div className="detail-row">
              <span className="detail-key">Auto-Restock</span>
              <span className="detail-val">Target {item.targetOnHand} · ×{item.restockBatch}</span>
            </div>
          )}
          {item.turnsLeft !== null && (
            <div className="detail-row">
              <span className="detail-key">Lifecycle</span>
              <span className="detail-val" style={{ color: item.turnsLeft <= 3 ? "var(--red)" : "var(--text-1)" }}>
                {item.turnsLeft} turn{item.turnsLeft !== 1 ? "s" : ""} left
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        {item.status === "Active" ? (
          <>
            {item.restockMode !== "auto" ? (
              <button className="action-btn primary" onClick={() => onRestock(item.id)}>
                Restock +{item.restockBatch || 50} Units
              </button>
            ) : (
              <div className="muted-small" style={{ textAlign: "center", padding: "6px 0" }}>
                Auto-restock is enabled — the turn engine handles inventory
              </div>
            )}
            <button className="action-btn" onClick={() => onArchive(item.id)}>Archive Drop</button>
          </>
        ) : (
          <button className="action-btn primary" onClick={() => onUnarchive(item.id)}>
            Restore to Active
          </button>
        )}
      </div>
    </>
  );
}

// ─── CreateMerchWizardModal ───────────────────────────────────────────────────

function CreateMerchWizardModal({ open, onClose, onCreate, releaseOptions }) {
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setErrors({});
      setForm(DEFAULT_FORM);
    }
  }, [open]);

  if (!open) return null;

  const sourcingInfo = SOURCING_TIERS[form.sourcingTier] ?? SOURCING_TIERS.Standard;
  const lifecycleTurns = LIFECYCLE_DEFAULTS[form.edition];

  const validate = () => {
    const e = {};
    if (step === 0 && !form.name.trim()) e.name = "Name is required.";
    if (step === 2) {
      if (!form.unitPrice || form.unitPrice <= 0) e.unitPrice = "Price must be > 0.";
      if (!form.stock || form.stock <= 0) e.stock = "Stock must be > 0.";
      if (form.restockMode === "auto") {
        if (!form.targetOnHand || form.targetOnHand <= 0) e.targetOnHand = "Target must be > 0.";
        if (!form.restockBatch || form.restockBatch <= 0) e.restockBatch = "Batch must be > 0.";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    if (step < WIZARD_STEPS.length - 1) setStep((s) => s + 1);
    else { onCreate(form); onClose(); }
  };

  const _editionKey = form.edition?.toLowerCase() ?? "standard";

  return (
    <>
      <button className="modal-overlay" onClick={onClose} aria-label="Close" />
      <div className="wizard-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="section-head">
          <h3 className="wizard-title">New Drop</h3>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Stepper */}
        <div className="stepper">
          {WIZARD_STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <span className={`step-item ${i === step ? "active" : i < step ? "done" : ""}`}>
                <span className={`step-dot ${i === step ? "active" : i < step ? "done" : ""}`} />
                {label}
              </span>
              {i < WIZARD_STEPS.length - 1 && <span className="step-sep" />}
            </React.Fragment>
          ))}
        </div>

        {/* ── Step 0: Type + Name ── */}
        {step === 0 && (
          <div style={{ display: "grid", gap: 14 }}>
            {/* Type grid */}
            <div>
              <label className="form-label">Merch Type</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {MERCH_TYPES_LIST.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((v) => ({ ...v, type: t }))}
                    style={{
                      border: `1px solid ${form.type === t ? "var(--gold-border)" : "var(--border)"}`,
                      background: form.type === t ? "rgba(201,168,76,0.07)" : "var(--surface)",
                      borderRadius: 11,
                      padding: "10px 4px",
                      display: "grid",
                      placeItems: "center",
                      gap: 4,
                      cursor: "pointer",
                      transition: "border-color 0.12s, background 0.12s",
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{MERCH_ICONS[t] ?? "📦"}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: form.type === t ? "var(--gold)" : "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {t}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="form-label">Drop Name</label>
              <input
                className="input"
                placeholder="e.g. Tour Noir Hoodie"
                value={form.name}
                onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              />
              {errors.name && <div className="muted-small" style={{ color: "var(--red)", marginTop: 5 }}>{errors.name}</div>}
            </div>

            <div>
              <label className="form-label">Linked Release <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <select
                className="select"
                value={form.linkedRelease}
                onChange={(e) => setForm((v) => ({ ...v, linkedRelease: e.target.value }))}
              >
                <option value="">— None —</option>
                {releaseOptions.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Step 1: Edition + Quality + Sourcing ── */}
        {step === 1 && (
          <div style={{ display: "grid", gap: 16 }}>
            {/* Edition */}
            <div>
              <label className="form-label">Edition</label>
              <div style={{ display: "grid", gap: 8 }}>
                {EDITION_TYPES.map((e) => {
                  const isExclusive = e === "Exclusive";
                  const isLimited = e === "Limited";
                  const selected = form.edition === e;
                  const color = isExclusive ? "var(--gold)" : isLimited ? "var(--purple)" : "var(--text-2)";
                  return (
                    <button
                      key={e}
                      type="button"
                      className={`option-card ${selected ? "selected" : ""}`}
                      style={selected ? { borderColor: isExclusive ? "var(--gold-border)" : isLimited ? "rgba(155,114,232,0.3)" : "var(--border)" } : {}}
                      onClick={() => setForm((v) => ({ ...v, edition: e }))}
                    >
                      <div className="option-card-lhs">
                        <span className="option-card-title" style={{ color }}>{e}</span>
                      </div>
                      {lifecycleTurns && e === form.edition && (
                        <div className="option-card-rhs">
                          <div className="option-card-cost">
                            <Clock size={9} style={{ display: "inline", marginRight: 3 }} />
                            {lifecycleTurns} turns
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quality */}
            <div>
              <label className="form-label">Quality Tier</label>
              <div className="segmented">
                {QUALITY_TIERS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`seg-btn ${form.qualityTier === q ? "active" : ""}`}
                    style={{ flex: 1 }}
                    onClick={() => setForm((v) => ({ ...v, qualityTier: q }))}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Sourcing — the strategic choice */}
            <div>
              <label className="form-label">Sourcing</label>
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(SOURCING_TIERS).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    className={`option-card ${form.sourcingTier === key ? "selected" : ""}`}
                    onClick={() => setForm((v) => ({ ...v, sourcingTier: key }))}
                  >
                    <div className="option-card-lhs">
                      <span className="option-card-icon">{cfg.icon}</span>
                      <div>
                        <div className="option-card-title">{cfg.label}</div>
                        <div className="option-card-desc">{cfg.description}</div>
                      </div>
                    </div>
                    <div className="option-card-rhs">
                      <span
                        className="option-card-badge"
                        style={{
                          background: `${cfg.riskColor}14`,
                          color: cfg.riskColor,
                          border: `1px solid ${cfg.riskColor}30`,
                        }}
                      >
                        {cfg.riskLabel}
                      </span>
                      <div className="option-card-cost">
                        {cfg.costMult > 1
                          ? `+${Math.round((cfg.costMult - 1) * 100)}% cost`
                          : cfg.costMult < 1
                          ? `-${Math.round((1 - cfg.costMult) * 100)}% cost`
                          : "Std cost"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Pricing + Stock + Restock ── */}
        {step === 2 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="form-label">Price per unit ($)</label>
                <input
                  className="input"
                  type="number" min="1" max={9999}
                  value={form.unitPrice}
                  onChange={(e) => setForm((v) => ({ ...v, unitPrice: Number(e.target.value) }))}
                />
                {errors.unitPrice && <div className="muted-small" style={{ color: "var(--red)", marginTop: 4 }}>{errors.unitPrice}</div>}
              </div>
              <div>
                <label className="form-label">Initial stock</label>
                <input
                  className="input"
                  type="number" min="1"
                  value={form.stock}
                  onChange={(e) => setForm((v) => ({ ...v, stock: Number(e.target.value) }))}
                />
                {errors.stock && <div className="muted-small" style={{ color: "var(--red)", marginTop: 4 }}>{errors.stock}</div>}
              </div>
            </div>

            {/* Restock mode */}
            <div>
              <label className="form-label">Restock Mode</label>
              <div className="segmented">
                {[["none", "Manual / Off"], ["auto", "Auto-Restock"]].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    className={`seg-btn ${form.restockMode === val ? "active" : ""}`}
                    style={{ flex: 1 }}
                    onClick={() => setForm((v) => ({ ...v, restockMode: val }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-restock config */}
            {form.restockMode === "auto" && (
              <div className="restock-cfg">
                <div className="muted-small" style={{ lineHeight: 1.5 }}>
                  Every N turns, the engine refills stock up to your target. Cost is charged automatically.
                </div>
                <div className="cfg-grid">
                  <div className="cfg-field">
                    <label className="form-label">Keep in stock</label>
                    <input className="input input-sm" type="number" min="1" value={form.targetOnHand}
                      onChange={(e) => setForm((v) => ({ ...v, targetOnHand: Number(e.target.value) }))} />
                    {errors.targetOnHand && <span className="muted-small" style={{ color: "var(--red)" }}>{errors.targetOnHand}</span>}
                  </div>
                  <div className="cfg-field">
                    <label className="form-label">Units per refill</label>
                    <input className="input input-sm" type="number" min="1" value={form.restockBatch}
                      onChange={(e) => setForm((v) => ({ ...v, restockBatch: Number(e.target.value) }))} />
                    {errors.restockBatch && <span className="muted-small" style={{ color: "var(--red)" }}>{errors.restockBatch}</span>}
                  </div>
                  <div className="cfg-field">
                    <label className="form-label">Every N turns</label>
                    <input className="input input-sm" type="number" min="1" value={form.restockIntervalTurns}
                      onChange={(e) => setForm((v) => ({ ...v, restockIntervalTurns: Math.max(1, Number(e.target.value)) }))} />
                  </div>
                  <div className="cfg-field">
                    <label className="form-label">Lifetime cap</label>
                    <input className="input input-sm" type="number" min="0" placeholder="∞" value={form.maxTotalUnits}
                      onChange={(e) => setForm((v) => ({ ...v, maxTotalUnits: e.target.value }))} />
                  </div>
                </div>
                {form.sourcingTier === "Questionable" && (
                  <div className="warn-box">
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    Auto-restocking questionable sourcing increases scandal exposure the bigger your fanbase grows.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Artwork + Review ── */}
        {step === 3 && (
          <div style={{ display: "grid", gap: 13 }}>
            <div>
              <label className="form-label">Artwork (optional)</label>
              <ImageUpload
                value={form.imageUrl}
                onChange={(url) => setForm((v) => ({ ...v, imageUrl: url }))}
                placeholder="Upload drop artwork"
                maxSizeMB={3}
                className="input"
              />
            </div>

            {/* Review summary */}
            <div className="review-card">
              <div className="review-name">{form.name || "New Drop"}</div>

              <div style={{ height: "1px", background: "var(--border)", margin: "2px 0" }} />

              <div className="review-row">
                <span className="review-key">Type</span>
                <span className="review-val">{MERCH_ICONS[form.type]} {form.type}</span>
              </div>
              <div className="review-row">
                <span className="review-key">Edition</span>
                <span className="review-val" style={{
                  color: form.edition === "Exclusive" ? "var(--gold)" : form.edition === "Limited" ? "var(--purple)" : "var(--text-1)"
                }}>
                  {form.edition}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Quality</span>
                <span className="review-val">{form.qualityTier}</span>
              </div>
              <div className="review-row">
                <span className="review-key">Sourcing</span>
                <span className="review-val" style={{ color: form.sourcingTier === "Ethical" ? "var(--green)" : form.sourcingTier === "Questionable" ? "var(--gold)" : "var(--text-1)" }}>
                  {sourcingInfo.icon} {form.sourcingTier}
                </span>
              </div>
              <div className="review-row">
                <span className="review-key">Price</span>
                <span className="review-val review-val gold">${form.unitPrice}</span>
              </div>
              <div className="review-row">
                <span className="review-key">Initial Stock</span>
                <span className="review-val">{form.stock.toLocaleString()} units</span>
              </div>
              <div className="review-row">
                <span className="review-key">Restock</span>
                <span className="review-val">
                  {form.restockMode === "auto"
                    ? `Auto — target ${form.targetOnHand}, ×${form.restockBatch}${form.maxTotalUnits ? `, cap ${form.maxTotalUnits}` : ""}`
                    : "Manual"}
                </span>
              </div>
              {lifecycleTurns && (
                <div className="review-row">
                  <span className="review-key">Sunset</span>
                  <span className="review-val">{lifecycleTurns} turns</span>
                </div>
              )}
            </div>

            {form.sourcingTier === "Questionable" && (
              <div className="warn-box">
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                Questionable sourcing carries scandal risk at scale. Risk grows with your fame.
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="footer-actions">
          <button
            className="wizard-btn"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </button>
          <button className="wizard-btn primary" onClick={next}>
            {step === WIZARD_STEPS.length - 1 ? "Create Drop" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── MerchAppPage (main) ──────────────────────────────────────────────────────

export default function MerchAppPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("active"); // "active" or "vault"
  const [merch, setMerch] = useState([]);
  const [releaseOptions, setReleaseOptions] = useState([]);
  const [artistId, setArtistId] = useState(null);
  const [cash, setCash] = useState(0);
  const [vidwaveShelfEnabled, setVidwaveShelfEnabled] = useState(false);
  const [vidwaveSubscribers, setVidwaveSubscribers] = useState(0);

  // ── load ──
  useEffect(() => {
    const load = async () => {
      try {
        const storedArtistId = localStorage.getItem("artist_id");
        const accountId = localStorage.getItem("user_account_id");
        let currentArtistId = storedArtistId;

        if (!currentArtistId && accountId) {
          const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: accountId });
          currentArtistId = profiles?.[0]?.id ?? null;
        }

        setArtistId(currentArtistId ?? null);
        if (!currentArtistId) { setLoading(false); return; }

        const [profiles, merchRows, releases, vidwaveAccounts] = await Promise.all([
          base44.entities.ArtistProfile.filter({ id: currentArtistId }),
          base44.entities.Merch.filter({ artist_id: currentArtistId }),
          base44.entities.Release.filter({ artist_id: currentArtistId }),
          base44.entities.SocialAccount.filter({ artist_id: currentArtistId, platform: 'vidwave' }),
        ]);

        const profile = profiles?.[0] ?? null;
        setCash(Number(profile?.cash ?? profile?.money ?? profile?.income ?? 0));

        // Build release artwork map for backfilling merch images
        const releaseArtworkMap = {};
        for (const r of (releases ?? [])) {
          if (r.id && r.cover_artwork_url) releaseArtworkMap[r.id] = r.cover_artwork_url;
        }
        // Backfill cover_artwork_url from linked release when merch has none
        const enrichedMerch = (merchRows ?? []).map(item => {
          if (!item.cover_artwork_url) {
            const rid = item.release_id ?? item.linked_release_id;
            if (rid && releaseArtworkMap[rid]) {
              return { ...item, cover_artwork_url: releaseArtworkMap[rid] };
            }
          }
          return item;
        });
        setMerch(enrichedMerch.map(normalizeMerch));
        setReleaseOptions((releases ?? []).map((r) => ({
          id: r.id,
          title: r.title ?? r.release_name ?? "Untitled Release",
        })));
        
        // Load VidWave merch shelf status
        const vidwaveAccount = vidwaveAccounts?.[0] ?? null;
        setVidwaveShelfEnabled(vidwaveAccount?.merch_shelf_enabled ?? false);
        setVidwaveSubscribers(Number(vidwaveAccount?.followers ?? 0));
      } catch (err) {
        console.error("[MerchApp] load failed", err);
        showToast("Could not load. Retry.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── derived ──
  const activeMerch = useMemo(() => merch.filter((m) => m.status === "Active"), [merch]);
  const retiredMerch = useMemo(() => merch.filter((m) => m.status === "Retired" || m.status === "Archived" || m.status === "Sold Out"), [merch]);
  const totalRevenue = useMemo(() => merch.reduce((s, m) => s + m.revenue, 0), [merch]);
  const totalSold = useMemo(() => merch.reduce((s, m) => s + m.sold, 0), [merch]);
  const totalStock = useMemo(() => activeMerch.reduce((s, m) => s + m.stock, 0), [activeMerch]);
  const totalRestocks = useMemo(() => merch.reduce((s, m) => s + m.restockCount, 0), [merch]);
  const hottest = useMemo(() => {
    return activeMerch.reduce((best, item) => {
      const total = item.sold + item.stock;
      const rate = total > 0 ? item.sold / total : 0;
      const bestRate = best ? best.sold / (best.sold + best.stock + 1) : -1;
      return rate > bestRate ? item : best;
    }, null);
  }, [activeMerch]);

  // ── actions ──
  const showToast = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  };

  const refreshRow = async (id) => {
    const rows = await base44.entities.Merch.filter({ id });
    const updated = rows?.[0] ? normalizeMerch(rows[0]) : null;
    if (updated) setMerch((prev) => prev.map((m) => (m.id === id ? updated : m)));
  };

  const restockItem = async (id) => {
    const current = merch.find((m) => m.id === id);
    if (!current) return;
    const batch = current.restockBatch || 50;
    
    // Calculate restock cost
    const typeConfig = MERCH_TYPES[current.type];
    const baseCost = typeConfig?.baseCost || 5;
    const sourcingMult = SOURCING_TIERS[current.sourcingTier]?.costMult || 1.0;
    const restockCost = Math.ceil(baseCost * batch * sourcingMult);
    
    // Check if player can afford
    if (cash < restockCost) {
      showToast(`Not enough cash. Need $${restockCost.toLocaleString()}`);
      return;
    }
    
    try {
      // Deduct cost from player cash
      const profiles = await base44.entities.ArtistProfile.filter({ id: artistId });
      const profile = profiles?.[0];
      if (profile) {
        await base44.entities.ArtistProfile.update(artistId, {
          cash: Number(profile.cash || 0) - restockCost
        });
        setCash(prev => prev - restockCost);
      }
      
      // Update merch stock
      await base44.entities.Merch.update(id, {
        stock: current.stock + batch,
        restock_count: (current.restockCount || 0) + 1,
      });
      await refreshRow(id);
      setSelected(null);
      showToast(`+${batch} units restocked for $${restockCost.toLocaleString()}`);
    } catch { showToast("Restock failed."); }
  };

  const archiveItem = async (id) => {
    try {
      await base44.entities.Merch.update(id, { status: "Archived" });
      await refreshRow(id);
      setSelected(null);
      showToast("Drop archived.");
    } catch { showToast("Archive failed."); }
  };

  const unarchiveItem = async (id) => {
    try {
      await base44.entities.Merch.update(id, { status: "Active" });
      await refreshRow(id);
      setSelected(null);
      showToast("Drop restored.");
    } catch { showToast("Restore failed."); }
  };

  const handleCreate = async (form) => {
    if (!artistId) { showToast("No artist selected."); return; }
    if (form.unitPrice > 9999) { showToast("Price cannot exceed $9,999 per unit."); return; }
    try {
      // Calculate production time based on merch type (1-5 turns)
      const productionTimes = {
        "CD": 3, "Vinyl": 5, "Cassette": 2, "T-Shirt": 4, "Hoodie": 5,
        "Snapback": 3, "Beanie": 3, "Sneakers": 7, "Perfume": 6, "Poster": 2,
        "Mug": 3, "Tote Bag": 3, "Hat": 3
      };
      const _productionTime = productionTimes[form.type] || 3;
      
      // Get current turn from localStorage or default
      const currentTurn = Number(localStorage.getItem("current_turn_id")) || 1;
      
      const created = await base44.entities.Merch.create({
        artist_id: artistId,
        name: form.name.trim(),
        merch_type: form.type,
        edition: form.edition,
        quality_tier: form.qualityTier,
        quality_score: form.qualityTier === "Premium" ? 90 : form.qualityTier === "Standard" ? 75 : form.qualityTier === "Budget" ? 55 : 35,
        price_per_unit: Number(form.unitPrice),
        stock: Number(form.stock),
        units_manufactured: Number(form.stock),
        total_units_sold: 0,
        units_sold: 0,
        total_revenue: 0,
        status: "Active",
        production_started_turn: currentTurn,
        cover_artwork_url: form.imageUrl || undefined,
        linked_release_id: form.linkedRelease || null,
        restock_count: 0,
        sourcing_tier: form.sourcingTier,
        restock_mode: form.restockMode,
        target_on_hand: form.restockMode === "auto" ? Number(form.targetOnHand) : 0,
        restock_batch: Number(form.restockBatch),
        restock_interval_turns: Number(form.restockIntervalTurns),
        max_total_units: form.maxTotalUnits ? Number(form.maxTotalUnits) : null,
        active_turns_count: 0,
        max_active_turns: LIFECYCLE_DEFAULTS[form.edition] ?? null,
        sellout_achieved: false,
        controversy_triggered: false,
        created_at: new Date().toISOString(),
      });
      setMerch((prev) => [normalizeMerch(created), ...prev]);
      showToast("Drop created.");

      // Fire merch_activation era action (best-effort, non-blocking)
      try {
        const eras = await base44.entities.Era.filter({ artist_id: artistId, is_active: true });
        const activeEra = eras?.[0];
        if (activeEra?.id) {
          const existingActions = Array.isArray(activeEra.era_actions) ? activeEra.era_actions : [];
          const alreadyDone = existingActions.some((a) => a.id === 'merch_activation');
          if (!alreadyDone) {
            await base44.functions.invoke('eraEvolutionDetector', {
              action: 'executeEraAction',
              eraId: activeEra.id,
              actionId: 'merch_activation',
              artistId,
            });
          }
        }
      } catch (eraErr) {
        console.warn('[MerchApp] merch_activation era action failed (non-fatal):', eraErr?.message);
      }
    } catch (err) {
      console.error("[MerchApp] create failed", err);
      const errorMsg = err?.message || String(err);
      showToast(`Create failed: ${errorMsg.slice(0, 100)}`);
      // Re-throw to expose in console with full stack trace
      throw err;
    }
  };

  // ── render ──
  return (
    <div className="merch-app">
      <div className="merch-container">

        {/* Top bar */}
        <div className="top-bar">
          <div className="back-wrap">
            <button
              className="back-btn"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/Career"))}
              aria-label="Back"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="back-label">Back</span>
          </div>
          <div className="title-wrap">
            <Sparkles size={14} color="var(--gold)" />
            <h1 className="page-title">Xtras</h1>
          </div>
          <div className="top-right">
            <div className="cash-chip">
              <CircleDollarSign size={13} />
              {formatCurrency(cash)}
            </div>
            <button className="create-btn" onClick={() => setWizardOpen(true)}>
              + New Drop
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="hero">
          <div className="hero-eyebrow">Total Revenue</div>
          <div className="hero-value">{formatCurrency(totalRevenue)}</div>
          <div className="hero-sub">
            <span>
              <span className="hero-sub-dot" style={{ background: "var(--green)" }} />
              {activeMerch.length} Active
            </span>
            <span>
              <span className="hero-sub-dot" />
              {retiredMerch.length} Retired
            </span>
          </div>
        </div>

        {/* Stats strip - wrapped to prevent horizontal scroll */}
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <div className="stats-row" aria-label="Merch stats" style={{ minWidth: "max-content" }}>
            <div className="stat-card">
              <div className="stat-label">
                <Boxes size={10} style={{ color: "var(--blue)" }} /> Stock
              </div>
              <div className="stat-value">{totalStock.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">
                <TrendingUp size={10} style={{ color: "var(--green)" }} /> Units Sold
              </div>
              <div className="stat-value">{totalSold.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">
                <Flame size={10} style={{ color: "var(--red)" }} /> Hottest Drop
              </div>
              <div className="stat-value" style={{ fontSize: 13, color: "var(--text-2)" }}>
                {hottest ? hottest.name : "—"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">
                <RotateCcw size={10} style={{ color: "var(--gold)" }} /> Restocks
              </div>
              <div className="stat-value gold">{totalRestocks}</div>
            </div>
          </div>
        </div>

        {/* VidWave Merch Shelf */}
        {vidwaveShelfEnabled && (
          <div style={{
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Play size={16} style={{ color: "#ef4444" }} />
              <h3 style={{ color: "white", fontSize: 14, fontWeight: 700, margin: 0 }}>VidWave Merch Shelf</h3>
              <span style={{
                fontSize: 8,
                padding: "2px 6px",
                borderRadius: 9999,
                background: "rgba(239, 68, 68, 0.2)",
                color: "#fca5a5",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                fontWeight: 700
              }}>+20% SALES</span>
            </div>
            <p style={{ color: "#9ca3af", fontSize: 12, margin: 0, marginBottom: 4 }}>
              Your merch appears on your VidWave channel. Sales from VidWave viewers get a 20% boost.
            </p>
            <p style={{ color: "#6b7280", fontSize: 10, margin: 0 }}>
              💎 Diamond Play Button • {vidwaveSubscribers.toLocaleString()} subscribers
            </p>
          </div>
        )}

        {/* Active/Vault Tabs */}
        <section style={{ display: "grid", gap: 14 }}>
          <div className="section-head">
            <h2 className="section-title">{activeTab === "active" ? "Active Drops" : "The Vault"}</h2>
            <div className="segmented">
              <button
                className={`seg-btn ${activeTab === "active" ? "active" : ""}`}
                onClick={() => setActiveTab("active")}
              >
                Active
              </button>
              <button
                className={`seg-btn ${activeTab === "vault" ? "active" : ""}`}
                onClick={() => setActiveTab("vault")}
              >
                Vault
              </button>
            </div>
          </div>

          {/* Active Tab Content */}
          {activeTab === "active" && (
            <>
              {loading ? (
                <div className="grid">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" />)}
                </div>
              ) : activeMerch.length === 0 ? (
                <div className="empty-state">
                  <Package size={22} className="empty-icon" />
                  <p className="empty-label">No drops yet. Create your first.</p>
                  <button className="create-btn" onClick={() => setWizardOpen(true)}>+ New Drop</button>
                </div>
              ) : (
                <div className="grid">
                  {activeMerch.map((item) => (
                    <MerchCard key={item.id} item={item} onOpen={setSelected} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Vault Tab Content */}
          {activeTab === "vault" && (
            <>
              {retiredMerch.length === 0 ? (
                <div className="empty-state">
                  <Package size={22} className="empty-icon" />
                  <p className="empty-label">No archived drops yet.</p>
                </div>
              ) : (
                <div className="grid vault-grid">
                  {retiredMerch.map((item) => (
                    <MerchCard key={item.id} item={item} onOpen={setSelected} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <ActionSurface
          item={selected}
          onClose={() => setSelected(null)}
          onRestock={restockItem}
          onArchive={archiveItem}
          onUnarchive={unarchiveItem}
        />

        <CreateMerchWizardModal
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onCreate={handleCreate}
          releaseOptions={releaseOptions}
        />
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
