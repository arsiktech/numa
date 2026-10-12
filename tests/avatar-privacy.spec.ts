import { expect, test } from "@playwright/test";

test("avatar preparation decodes, crops and strips metadata without retaining object URLs", async ({ page, baseURL }) => {
  test.skip(!baseURL || !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(baseURL), "Local source-module integration test; not a production endpoint.");
  await page.goto("/welcome");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/avatarUpload.ts";
    const { prepareAvatar } = await import(modulePath);
    const original = document.createElement("canvas"); original.width = 400; original.height = 200;
    const context = original.getContext("2d")!;
    context.fillStyle = "blue"; context.fillRect(0, 0, 400, 200);
    context.fillStyle = "red"; context.fillRect(100, 0, 200, 200);
    const blob = await new Promise<Blob>(resolve => original.toBlob(value => resolve(value!), "image/png"));
    const file = new File([blob], "synthetic-avatar.png", { type: "image/png" });
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    const created: string[] = [], revoked: string[] = [];
    URL.createObjectURL = value => { const url = create(value); created.push(url); return url; };
    URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };
    try {
      const prepared = await prepareAvatar(file, new AbortController().signal);
      const bitmap = await createImageBitmap(new Blob([prepared], { type: "image/png" }));
      const rendered = document.createElement("canvas"); rendered.width = bitmap.width; rendered.height = bitmap.height;
      const output = rendered.getContext("2d")!; output.drawImage(bitmap, 0, 0); bitmap.close();
      rendered.id = "avatar-render-evidence"; rendered.setAttribute("aria-label", "Synthetic normalized profile thumbnail"); document.body.append(rendered);
      const left = Array.from(output.getImageData(1, 128, 1, 1).data), right = Array.from(output.getImageData(254, 128, 1, 1).data);
      const bytes = new Uint8Array(prepared), view = new DataView(prepared), chunks: string[] = [];
      for (let at = 8; at + 12 <= bytes.length;) { chunks.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8))); at += view.getUint32(at) + 12; }
      const canceled = new AbortController(); canceled.abort();
      let canceledBeforeUpload = false;
      try { await prepareAvatar(file, canceled.signal); } catch (error) { canceledBeforeUpload = error instanceof DOMException && error.name === "AbortError"; }
      return { width: rendered.width, height: rendered.height, left, right, chunks, bytes: bytes.length, created: created.length, revoked: revoked.length, allReleased: created.every(url => revoked.includes(url)), canceledBeforeUpload };
    } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; original.width = original.height = 0; }
  });
  expect(result).toMatchObject({ width: 256, height: 256, left: [255, 0, 0, 255], right: [255, 0, 0, 255], created: 1, revoked: 1, allReleased: true, canceledBeforeUpload: true });
  expect(result.bytes).toBeLessThanOrEqual(300 * 1024);
  expect(result.chunks[0]).toBe("IHDR"); expect(result.chunks.at(-1)).toBe("IEND");
  expect(result.chunks.every(name => ["IHDR", "IDAT", "IEND"].includes(name))).toBe(true);
  await test.info().attach("normalized-thumbnail", { body: await page.locator("#avatar-render-evidence").screenshot(), contentType: "image/png" });
});
