import { beforeEach, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ json: request }));
import { unholdCollectionMissionItem } from "./collectionMissions";

beforeEach(() => request.mockReset());

it("보류 복구를 인증이 유지되는 임무 item API POST로 보낸다", async () => {
  request.mockResolvedValue({ item_id: "item/1", status: "accepted", delivery_queued: true });
  await unholdCollectionMissionItem("mission 1", "item/1");
  expect(request).toHaveBeenCalledWith(
    "/api/assistant/collect/missions/mission%201/items/item%2F1/unhold",
    { method: "POST" },
  );
});
