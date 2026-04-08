// Extracted from chartUpdateModule.ts (v1 legacy). See: Plan 049 v1 deprecation.
//
// Standalone certification processing module.
// Checks all active releases against RIAA-style certification thresholds and
// returns new certifications and their notifications for staging by the commit pipeline.
// No direct DB writes — follows the staging pattern.

// Certification thresholds — must stay in sync with chartUpdateModule.ts until v1 is deleted.
// Based on RIAA: 150 streams = 1 unit, Gold = 500K units, Platinum = 1M units, Diamond = 10M units.
const CERTIFICATION_THRESHOLDS = [
  { level: 'Diamond', streams: 1_500_000_000, detail: 'Diamond' },        // 1.5B streams (10M units)
  { level: 'Multi-Platinum', streams: 900_000_000, detail: '6x Platinum' },  // 900M (6M units)
  { level: 'Multi-Platinum', streams: 600_000_000, detail: '4x Platinum' },  // 600M (4M units)
  { level: 'Multi-Platinum', streams: 300_000_000, detail: '2x Platinum' },  // 300M (2M units)
  { level: 'Platinum', streams: 150_000_000, detail: 'Platinum' },       // 150M streams (1M units)
  { level: 'Gold', streams: 75_000_000, detail: 'Gold' },                // 75M streams (500K units)
];

/**
 * Check all active releases against certification thresholds.
 * Returns only certifications that have not yet been awarded.
 */
function checkCertifications(
  releases: any[],
  existingCerts: any[],
  globalTurnId: number
): any[] {
  const newCerts: any[] = [];

  // Build lookup: release_id → set of certification_detail (use detail for multi-platinum differentiation)
  const certMap = new Map<string, Set<string>>();
  for (const cert of existingCerts) {
    if (!certMap.has(cert.release_id)) certMap.set(cert.release_id, new Set());
    certMap.get(cert.release_id)!.add(cert.certification_detail || cert.certification_level);
  }

  for (const release of releases) {
    const streams = Number(release.lifetime_streams) || 0;
    const existingSet = certMap.get(release.id) || new Set();

    for (const threshold of CERTIFICATION_THRESHOLDS) {
      if (streams >= threshold.streams && !existingSet.has(threshold.detail)) {
        newCerts.push({
          release_id: release.id,
          artist_id: release.artist_id,
          certification_level: threshold.level,
          certification_detail: threshold.detail,
          region: 'Global',
          streams_at_certification: streams,
          turn_achieved: globalTurnId,
          notified: false,
          // Internal: display title for notification generation, stripped before DB insert
          _release_title: release.title || release.name || 'Your release',
        });
        existingSet.add(threshold.detail);
      }
    }
  }

  return newCerts;
}

/**
 * processCertificationsForTurn
 *
 * Runs once per turn in the global post-player section of turnEngine.ts.
 * Checks active releases for new RIAA-style certifications and builds
 * notification objects for each new cert.
 *
 * Returns deltas only — no direct DB writes.
 * The commit pipeline in turnEngine.ts handles conditional create/upsert.
 *
 * @param globalTurnId  Current game turn number
 * @param entities      Entity adapter (provides Release.filter, Certification.list)
 * @param firstPlayerId Used only for logging/identification; not written to cert rows
 */
export async function processCertificationsForTurn(
  globalTurnId: number,
  entities: any,
  firstPlayerId: string
): Promise<{ success: boolean; certification_creates: any[]; notification_creates: any[] }> {
  try {
    const allReleases = await entities.Release.filter({
      lifecycle_state: ['Hot', 'Trending', 'Momentum', 'Stable', 'Declining'],
    });

    if (!allReleases?.length) {
      return { success: true, certification_creates: [], notification_creates: [] };
    }

    const existingCerts = (await entities.Certification.list()) ?? [];
    const newCerts = checkCertifications(allReleases, existingCerts, globalTurnId);

    // Build notification objects for each new cert
    const certNotifications: any[] = [];
    for (const cert of newCerts) {
      const emoji = cert.certification_level === 'Diamond' ? '💎'
        : cert.certification_level === 'Gold' ? '🥇'
        : '💿';
      const releaseTitle = cert._release_title || 'Your release';
      certNotifications.push({
        player_id: cert.artist_id,
        type: 'ACHIEVEMENT',
        title: `${emoji} ${cert.certification_detail} Certified!`,
        subtitle: `"${releaseTitle}" just went ${cert.certification_detail}!`,
        body: `With ${Number(cert.streams_at_certification).toLocaleString()} streams, "${releaseTitle}" has been certified ${cert.certification_detail}.`,
        priority: 'high',
        is_read: false,
        metrics: {
          certification_level: cert.certification_level,
          certification_detail: cert.certification_detail,
          streams: cert.streams_at_certification,
          release_id: cert.release_id,
          release_title: releaseTitle,
        },
        deep_links: { page: 'ChartsApp' },
        idempotency_key: `cert_${cert.release_id}_${cert.certification_detail}`,
        // Internal: index into newCerts for turnEngine conditional notification commit
        _cert_index: newCerts.indexOf(cert),
      });
    }

    return { success: true, certification_creates: newCerts, notification_creates: certNotifications };
  } catch (e: any) {
    console.error('[certificationModule] processCertificationsForTurn failed:', e?.message || e);
    return { success: false, certification_creates: [], notification_creates: [] };
  }
}
