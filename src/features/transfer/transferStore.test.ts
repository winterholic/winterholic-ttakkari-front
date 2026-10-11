import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";

const api = vi.hoisted(() => ({
  startTransfer: vi.fn(),
  putTransferChunk: vi.fn(),
  transferStatus: vi.fn(),
  completeTransfer: vi.fn(),
  cancelTransfer: vi.fn(),
}));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));

const { __resetTransfers, addFiles, useTransfers } = await import("./transferStore");
void useTransfers;

const opts = { convertHeic: true, stripLocation: true, keepOriginal: false };

async function until(pred: () => boolean) {
  for (let i = 0; i < 200 && !pred(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(pred()).toBe(true);
}

afterEach(() => {
  __resetTransfers();
  vi.clearAllMocks();
});

describe("transferStore", () => {
  it("조각으로 올리고, 위치가 어긋나면 서버 크기부터, 네트워크가 끊기면 상태를 다시 물어 이어 올린다", async () => {
    const file = new File([new Uint8Array(10)], "image.heic");
    let server = 0;
    let dropped = false;
    api.startTransfer.mockResolvedValue({ id: "t1", received: 0, size: 10, chunk_size: 4 });
    api.putTransferChunk.mockImplementation(async (_id: string, offset: number, blob: Blob) => {
      if (offset === 4 && !dropped) {
        dropped = true;
        server = 6; // 응답은 못 받았지만 서버는 일부를 받았다
        throw new TypeError("Load failed");
      }
      if (offset !== server) throw new ApiError(409, { code: "offset_mismatch", message: `received=${server}` });
      server += blob.size;
      return { id: "t1", received: server, size: 10, chunk_size: 4 };
    });
    api.transferStatus.mockImplementation(async () => ({ id: "t1", received: server, size: 10, chunk_size: 4 }));
    api.completeTransfer.mockResolvedValue({ files: [{ path: "/x/IMG_1.jpg", name: "IMG_1.jpg", size: 9, artifact_id: "a" }], notes: ["HEIC 사진을 JPG로 바꿨어요"] });

    addFiles([file], "/x", opts);
    // 끊긴 뒤 대기(백오프) 중에 화면으로 돌아오면 기다리지 않고 바로 다시 시도한다.
    await until(() => dropped);
    await new Promise((r) => setTimeout(r, 10));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await until(() => api.completeTransfer.mock.calls.length === 1);
    expect(api.startTransfer).toHaveBeenCalledWith(expect.objectContaining({ filename: "image.heic", size: 10, dest_dir: "/x", convert_heic: true }));
    expect(api.transferStatus).toHaveBeenCalled();
    expect(server).toBe(10);
    // 서버가 정한 조각 크기(4)로 나눠 보냈다.
    expect(api.putTransferChunk.mock.calls.every((c) => (c[2] as Blob).size <= 4)).toBe(true);
  });

  it("4xx(권한 폴더 밖 등)는 재시도하지 않고 실패로 남긴다", async () => {
    api.startTransfer.mockRejectedValue(new ApiError(403, { code: "outside_root", message: "권한 폴더 밖이에요." }));
    addFiles([new File(["a"], "a.txt")], "/nope", opts);
    await until(() => api.startTransfer.mock.calls.length === 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.putTransferChunk).not.toHaveBeenCalled();
  });
});
