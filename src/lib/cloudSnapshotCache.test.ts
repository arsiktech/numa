import { describe, expect, it } from "vitest";
import {
  cloudSnapshotCacheKey,
  readCloudSnapshotCache,
  writeCloudSnapshotCache
} from "./cloudSnapshotCache";
import type { MoneyPod, PodMember } from "./types";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
}

const pod: MoneyPod = {
  id: "pod-1",
  name: "Home",
  currency: "EUR",
  ownerUserId: "user-1",
  createdAt: 1
};

const member: PodMember = {
  id: "member-1",
  podId: pod.id,
  displayName: "Arseny",
  linkedUserId: "user-1",
  role: "owner",
  joinedAt: 1
};

describe("cloud snapshot cache", () => {
  it("round-trips pod snapshots by scoped account key", () => {
    const storage = memoryStorage();
    const ok = writeCloudSnapshotCache(
      "prod|owner@example.com",
      {
        moneyPods: [pod],
        byPod: {
          [pod.id]: {
            pod,
            members: [member],
            groups: [],
            expenses: [],
            settlements: []
          }
        }
      },
      { storage, now: 1000 }
    );

    expect(ok).toBe(true);
    expect(
      readCloudSnapshotCache("prod|owner@example.com", {
        storage,
        now: 2000
      })
    ).toMatchObject({
      savedAt: 1000,
      moneyPods: [pod],
      byPod: {
        [pod.id]: {
          pod,
          members: [member]
        }
      }
    });
  });

  it("ignores malformed and expired snapshots", () => {
    const storage = memoryStorage();
    storage.setItem(cloudSnapshotCacheKey("scope"), JSON.stringify({ version: 1 }));
    expect(readCloudSnapshotCache("scope", { storage })).toBeNull();

    writeCloudSnapshotCache("scope", { moneyPods: [pod], byPod: {} }, { storage, now: 0 });
    expect(
      readCloudSnapshotCache("scope", {
        storage,
        now: 1000 * 60 * 60 * 24 * 31
      })
    ).toBeNull();
  });
});
