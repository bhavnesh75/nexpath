// Register resolution — maps a UserProfile (or its absence) to one of
// the three register variants the decision-session content surface
// supports.
//
// Single-dispatch helper: one switch over UserNature, every case
// explicit. Mirrors the isVibe / selectAbsenceMap routing in
// options.ts so the runtime stays consistent with the static-content
// resolution layer.

import type { UserProfile } from '../classifier/types.js';

/** The three register variants supported by the decision-session content surface. */
export type Register = 'formal' | 'casual' | 'beginner';

/**
 * Resolve the register for the given profile.
 *
 *   beginner       → 'beginner'  (matches the isVibe gate)
 *   cool_geek      → 'beginner'  (vibe-coder routing)
 *   hardcore_pro   → 'formal'
 *   pro_geek_soul  → 'casual'
 *   undefined/null → 'casual'    (no profile yet; default register)
 */
export function profileToRegister(profile?: UserProfile | null): Register {
  switch (profile?.nature) {
    case 'beginner':      return 'beginner';
    case 'cool_geek':     return 'beginner';
    case 'hardcore_pro':  return 'formal';
    case 'pro_geek_soul': return 'casual';
    case undefined:       return 'casual';
    default:              return 'casual';
  }
}
