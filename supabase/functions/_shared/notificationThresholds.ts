/**
 * NOTIFICATION THRESHOLDS — Centralized, tunable constants
 * Replace magic numbers scattered across generators.
 */

export const NOTIFICATION_THRESHOLDS = {
  // Follower spike: minimum follower growth to trigger notification
  follower_spike: 10,

  // Streaming spike: minimum streams per turn to trigger notification
  streaming_spike: 5000,

  // Merch surge: minimum revenue AND units to trigger notification
  merch_surge_revenue: 100,
  merch_surge_units: 5,

  // Social media income: minimum social revenue OR social follower growth
  social_revenue_min: 10,
  social_follower_growth_min: 5,

  // Platform breakout: minimum daily streams on a single platform
  platform_breakout_streams: 5000,

  // Archetype shift: minimum dominant percentage to notify
  archetype_dominant_pct: 35,

  // Grouping windows (in turns)
  group_window_short: 7,   // follower spikes, streaming, merch
  group_window_long: 14,   // market shifts, playlists, career/era
};

export type NotificationThresholds = typeof NOTIFICATION_THRESHOLDS;
