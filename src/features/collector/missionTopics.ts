import type { CollectionMission } from "../../api/collectionMissions";

export interface MissionTopic {
  key: string;
  current: CollectionMission;
  attempts: CollectionMission[];
}

const ACTIVE = new Set(["running", "queued", "paused", "discovery_pending", "waiting_sources"]);

/** Only server-verified intent identity may merge ledgers; a matching title is insufficient. */
export function missionTopics(missions: CollectionMission[]): MissionTopic[] {
  const groups = new Map<string, CollectionMission[]>();
  for (const mission of missions) {
    const key = mission.topic_key ?? mission.id;
    const attempts = groups.get(key) ?? [];
    if (!attempts.some(attempt => attempt.id === mission.id)) attempts.push(mission);
    groups.set(key, attempts);
  }
  return [...groups].map(([key, entries]) => {
    const attempts = [...entries].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id.localeCompare(a.id));
    return { key, attempts, current: attempts.find(attempt => ACTIVE.has(attempt.status)) ?? attempts[0] };
  });
}
