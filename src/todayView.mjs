// Today View compatibility entry point.
//
// Release 1 -> Today View contract (task AICC-TSK-002) and the grounded
// next-actions prototype (task AICC-TSK-003) are built here as a pure
// function over the persisted roadmap. The view never invents tasks or
// metrics, never stores a second copy of task state, and never mutates the
// roadmap. Today’s Focus and Waiting rules live in todayFocus.mjs.

import { buildTodayFocus } from './todayFocus.mjs';

export function buildTodayView(roadmap, referenceDateString) {
  const derived = buildTodayFocus(roadmap, referenceDateString);
  return { ...derived, items: derived.focus };
}

export { buildTodayFocus };
