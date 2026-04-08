interface ProjectUpdate {
  projectId: string;
  status: 'released' | 'scheduled';
  releaseDate?: string;
}

interface ApplyPostReleaseEffectsParams {
  artistId: string;
  globalTurnId: number;
  warnings: string[];
  projectUpdate?: ProjectUpdate;
  eraMode: 'advance' | 'preserve';
  triggerEvent: 'release';
  surpriseDrop?: boolean;
}

function nextEraPhase(currentPhase: string | null | undefined) {
  if (currentPhase === 'TEASE') return 'DROP';
  if (currentPhase === 'DROP') return 'SUSTAIN';
  return currentPhase || null;
}

export async function applyPostReleaseEffects(
  db: any,
  params: ApplyPostReleaseEffectsParams,
): Promise<{ eraPhase: string | null; warnings: string[] }> {
  const {
    artistId,
    globalTurnId,
    warnings,
    projectUpdate,
    eraMode,
    triggerEvent,
    surpriseDrop = false,
  } = params;
  const nextWarnings = [...warnings];

  if (projectUpdate?.projectId) {
    const projectPatch: Record<string, unknown> = {
      project_status: projectUpdate.status,
      status: projectUpdate.status,
    };
    if (projectUpdate.releaseDate) {
      projectPatch.release_date = projectUpdate.releaseDate;
    }

    const { error: projectError } = await db
      .from('projects')
      .update(projectPatch)
      .eq('id', projectUpdate.projectId);

    if (projectError) {
      console.error(
        `[releaseManagerPostRelease] Project status update failed — projectId=${projectUpdate.projectId} error=${projectError.message}`,
      );
      nextWarnings.push(
        `Project status update failed for project ${projectUpdate.projectId}: ${projectError.message || 'unknown error'}`,
      );
    }
  }

  if (eraMode === 'advance') {
    try {
      const { data: activeEra } = await db
        .from('eras')
        .select('id, phase')
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .maybeSingle();

      if (activeEra?.id) {
        const phase = nextEraPhase(activeEra.phase);
        const patch: Record<string, unknown> = {
          trigger_event: triggerEvent,
          last_event_turn: globalTurnId,
        };
        if (phase) {
          patch.phase = phase;
        }
        if (surpriseDrop) {
          patch.surprise_drop = true;
        }

        const { error: eraError } = await db
          .from('eras')
          .update(patch)
          .eq('id', activeEra.id);

        if (eraError) {
          console.error('[releaseManagerPostRelease] Era update failed:', eraError);
          nextWarnings.push('Era phase update failed');
        }
      }
    } catch (eraError) {
      console.error('[releaseManagerPostRelease] Era update threw:', eraError);
      nextWarnings.push('Era phase update failed');
    }
  }

  try {
    const { data: currentEra } = await db
      .from('eras')
      .select('phase')
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .maybeSingle();

    return {
      eraPhase: currentEra?.phase || null,
      warnings: nextWarnings,
    };
  } catch (_error) {
    return {
      eraPhase: null,
      warnings: nextWarnings,
    };
  }
}
