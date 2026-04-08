/**
 * RELEASE STATE INVARIANTS - Enforce consistency between lifecycle_state and status fields
 * Prevents issues like euphoria showing lifecycle_state='Stable' but release_status='scheduled'
 */

export interface ReleaseRow {
  id: string;
  lifecycle_state?: string;
  release_status?: string;
  project_status?: string;
  project_id?: string;
  scheduled_turn?: number;
  project_type?: string; // 'Single', 'Album', 'EP', 'Mixtape', etc.
  lifecycle_state_changed_turn?: number;
  /** Plan 016 §4 — immutable final outcome; written once at terminal evaluation. */
  final_outcome_class?: string | null;
}

export interface ProjectRow {
  id: string;
  project_status?: string;
}

/**
 * Enforces invariants when lifecycle_state is updated
 * Returns the patch object that should be applied to maintain consistency
 */
export function enforceReleaseInvariants(
  release: ReleaseRow,
  newLifecycleState?: string,
  project?: ProjectRow
): { releasePatch: Partial<ReleaseRow>; projectPatch?: Partial<ProjectRow> } {
  const currentState = (release.lifecycle_state || '').toLowerCase();
  const targetState = (newLifecycleState || currentState).toLowerCase();
  const currentStatus = (release.release_status || '').toLowerCase();
  const projectStatus = (release.project_status || '').toLowerCase();

  const releasePatch: Partial<ReleaseRow> = {};
  const projectPatch: Partial<ProjectRow> = {};

  // INVARIANT I1: Progressed lifecycle states must have release_status='released'
  // Includes both active phases and all terminal outcome states
  const progressedStates = [
    'hot', 'trending', 'momentum', 'stable', 'declining',
    'archived', 'legacy', 'cultclassic', 'sleeperhit', 'deepcut', 'flop',
    'legendary', 'classic', 'smashhit', 'hit', 'solid', 'strongstart', 'onehitwonder',
  ];
  const isProgressedState = progressedStates.includes(targetState);
  
  if (isProgressedState && currentStatus === 'scheduled') {
    releasePatch.release_status = 'released';
    console.warn(`[Invariants] Auto-correcting release ${release.id}: lifecycle_state=${targetState} but release_status='scheduled' → setting to 'released'`);
  }

  // INVARIANT I2: Project-level releases (not singles) should update project status
  const isProjectLevelRelease = release.project_id && 
    ['album', 'ep', 'mixtape', 'demo'].includes((release.project_type || '').toLowerCase());

  if (isProgressedState && isProjectLevelRelease && projectStatus === 'scheduled') {
    projectPatch.project_status = 'released';
    console.warn(`[Invariants] Auto-correcting project ${release.project_id}: release ${release.id} progressed to ${targetState} but project_status='scheduled' → setting to 'released'`);
  }

  // INVARIANT I3: If release_status='scheduled', lifecycle_state must be 'scheduled'
  if (currentStatus === 'scheduled' && !['scheduled', 'draft'].includes(targetState)) {
    // This case should be handled by I1 above, but ensure consistency
    if (!releasePatch.release_status) {
      releasePatch.release_status = 'released';
    }
  }

  // Apply new lifecycle state if provided
  // NOTE: Do NOT set lifecycle_state_changed_turn here — turn processor sets it to globalTurnId.
  // Date.now() returns milliseconds (~1.7e12) which breaks the turn-delta math entirely.
  if (newLifecycleState && newLifecycleState !== release.lifecycle_state) {
    releasePatch.lifecycle_state = newLifecycleState;
  }

  // INVARIANT I4 (Plan 016 §7.6): final_outcome_class is immutable once set.
  // Log a warning if the proposed state is active but final_outcome_class is already populated.
  // This does NOT block the update — the immutability guard lives at the patch-generation site.
  const activeStates = ['hot', 'trending', 'momentum', 'stable', 'declining', 'scheduled'];
  if (
    release.final_outcome_class != null &&
    activeStates.includes(targetState)
  ) {
    console.warn(
      `[Invariants] I4: release ${release.id} has final_outcome_class='${release.final_outcome_class}' ` +
      `but lifecycle_state is transitioning to active phase '${targetState}'. ` +
      'final_outcome_class should not be changed — guard at patch-generation site.',
    );
  }

  return { releasePatch, projectPatch: Object.keys(projectPatch).length > 0 ? projectPatch : undefined };
}

/**
 * Detect existing invariant violations for debugging/backfill
 */
export function detectInvariantViolations(releases: ReleaseRow[]): Array<{
  release: ReleaseRow;
  violations: string[];
  fixes: { releasePatch: Partial<ReleaseRow>; projectPatch?: Partial<ProjectRow> };
}> {
  const violations: Array<{
    release: ReleaseRow;
    violations: string[];
    fixes: { releasePatch: Partial<ReleaseRow>; projectPatch?: Partial<ProjectRow> };
  }> = [];

  for (const release of releases) {
    const releaseViolations: string[] = [];
    const currentState = (release.lifecycle_state || '').toLowerCase();
    const currentStatus = (release.release_status || '').toLowerCase();
    const projectStatus = (release.project_status || '').toLowerCase();

    // Check I1 violation — includes all terminal outcome states
    const progressedStates = [
      'hot', 'trending', 'momentum', 'stable', 'declining',
      'archived', 'legacy', 'cultclassic', 'sleeperhit', 'deepcut', 'flop',
      'legendary', 'classic', 'smashhit', 'hit', 'solid', 'strongstart', 'onehitwonder',
    ];
    if (progressedStates.includes(currentState) && currentStatus === 'scheduled') {
      releaseViolations.push('I1: lifecycle_state progressed but release_status still "scheduled"');
    }

    // Check I3 violation
    if (currentStatus === 'scheduled' && currentState !== 'scheduled' && currentState !== 'draft') {
      releaseViolations.push('I3: release_status="scheduled" but lifecycle_state not "Scheduled"');
    }

    // Check I4 violation (Plan 016 §7.6): final_outcome_class set but lifecycle_state is active
    const activeStates = ['hot', 'trending', 'momentum', 'stable', 'declining', 'scheduled'];
    if (release.final_outcome_class != null && activeStates.includes(currentState)) {
      releaseViolations.push(
        `I4: final_outcome_class='${release.final_outcome_class}' but lifecycle_state='${release.lifecycle_state}' is an active phase (possible corrupted write)`,
      );
    }

    if (releaseViolations.length > 0) {
      const fixes = enforceReleaseInvariants(release);
      violations.push({ release, violations: releaseViolations, fixes });
    }
  }

  return violations;
}
