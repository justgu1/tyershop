import { DropPhase, DropSchedule, nextPhaseChange, resolveDropPhase } from "./phase"

type DropRecord = DropSchedule & Record<string, any>

export function presentDrop<T extends DropRecord>(drop: T, now: Date = new Date()) {
  const phase: DropPhase = resolveDropPhase(drop, now)
  return {
    ...drop,
    phase,
    next_phase_at: nextPhaseChange(drop, phase)?.toISOString() ?? null,
  }
}
