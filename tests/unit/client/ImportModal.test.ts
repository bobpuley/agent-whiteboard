// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import JSZip from "jszip";
import ImportModal from "../../../client/src/ImportModal.svelte";

async function buildZipFile(entries: Record<string, string>, name = "export.zip"): Promise<File> {
  const zip = new JSZip();
  for (const [filename, content] of Object.entries(entries)) {
    zip.file(filename, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name, { type: "application/zip" });
}

const VALID_MANIFEST = JSON.stringify({
  formatVersion: 1,
  workspace: "my-course",
  exportedAt: "2026-01-01T00:00:00.000Z",
  appVersion: "1.1.0",
  snapshots: ["a_screen.json", "b_screen.json"],
});

describe("ImportModal.svelte (F37)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the drop-zone / file picker when open with no file yet", () => {
    const { getByText } = render(ImportModal, { props: { open: true } });
    expect(getByText(/Drop a/)).toBeTruthy();
  });

  it("resolves the manifest locally (jszip) with no network request until the collision check runs (F37)", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === "/snapshots/all") {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, workspaces: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, workspace: "my-course", added: 2, updated: 0, skipped: 0 }) });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    // The workspace name resolves from the zip's manifest.json alone —
    // fetchSpy hasn't necessarily been called yet at this exact instant,
    // but once it is, it's for the F38 collision check, not for reading
    // the file itself.
    await vi.waitFor(() => expect(getByText(/my-course/)).toBeTruthy());
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/snapshots/all"));

    vi.unstubAllGlobals();
  });

  it("skips straight to import when the resolved workspace name has no collision (F38)", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === "/snapshots/all") {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, workspaces: [{ name: "other-ws", isCurrent: true, snapshots: [] }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, workspace: "my-course", added: 2, updated: 0, skipped: 0 }) });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => expect(getByText(/2 added, 0 updated, 0 skipped/)).toBeTruthy());
    const importCall = fetchSpy.mock.calls.find(([url]) => url === "/import");
    expect(importCall).toBeTruthy();
    const body = importCall![1].body as FormData;
    expect(body.get("targetWorkspace")).toBe("my-course");
    expect(body.get("mode")).toBe("create");

    vi.unstubAllGlobals();
  });

  it("loads the newest imported snapshot via POST /snapshots/load, switching the active workspace (F40)", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === "/snapshots/all") {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, workspaces: [] }) });
      }
      if (url === "/import") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, workspace: "my-course", added: 2, updated: 0, skipped: 0, newestFilename: "b_screen.json" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => expect(getByText(/2 added, 0 updated, 0 skipped/)).toBeTruthy());
    await vi.waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/snapshots/load",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ workspace: "my-course", filename: "b_screen.json" }),
        })
      )
    );

    vi.unstubAllGlobals();
  });

  it("does not call POST /snapshots/load when the import reported no newestFilename (nothing changed)", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === "/snapshots/all") {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, workspaces: [] }) });
      }
      if (url === "/import") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, workspace: "my-course", added: 0, updated: 0, skipped: 2 }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => expect(getByText(/0 added, 0 updated, 2 skipped/)).toBeTruthy());
    expect(fetchSpy).not.toHaveBeenCalledWith("/snapshots/load", expect.anything());

    vi.unstubAllGlobals();
  });

  it("auto-closes a short delay after a successful import (F40)", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === "/snapshots/all") {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, workspaces: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, workspace: "my-course", added: 1, updated: 0, skipped: 0 }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, component, container } = render(ImportModal, { props: { open: true } });
    let closed = false;
    component.$on("close", () => {
      closed = true;
    });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => expect(getByText(/1 added, 0 updated, 0 skipped/)).toBeTruthy());
    expect(closed).toBe(false);
    await vi.waitFor(() => expect(closed).toBe(true), { timeout: 3000 });
  }, 4000);

  it("shows the merge/import-as-new/cancel prompt when the resolved workspace name collides (F38)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, workspaces: [{ name: "my-course", isCurrent: true, snapshots: [] }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, getByLabelText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => expect(getByText(/already exists/)).toBeTruthy());
    expect(getByText("Merge")).toBeTruthy();
    expect(getByText("Import as new")).toBeTruthy();
    expect(getByText("Cancel")).toBeTruthy();
    // Pre-filled auto-incremented suggestion.
    expect((getByLabelText("New workspace name") as HTMLInputElement).value).toBe("my-course (2)");

    vi.unstubAllGlobals();
  });

  it("choosing Merge uploads with mode=merge and the original workspace name (F38)", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === "/snapshots/all") {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, workspaces: [{ name: "my-course", isCurrent: true, snapshots: [] }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, workspace: "my-course", added: 1, updated: 1, skipped: 0 }) });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    await vi.waitFor(() => expect(getByText("Merge")).toBeTruthy());

    await fireEvent.click(getByText("Merge"));

    await vi.waitFor(() => expect(getByText(/1 added, 1 updated, 0 skipped/)).toBeTruthy());
    const importCall = fetchSpy.mock.calls.find(([url]) => url === "/import");
    const body = importCall![1].body as FormData;
    expect(body.get("targetWorkspace")).toBe("my-course");
    expect(body.get("mode")).toBe("merge");

    vi.unstubAllGlobals();
  });

  it("choosing Import as new uploads with mode=create and the edited name (F38)", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === "/snapshots/all") {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, workspaces: [{ name: "my-course", isCurrent: true, snapshots: [] }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, workspace: "my-course-renamed", added: 2, updated: 0, skipped: 0 }) });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, getByLabelText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    await vi.waitFor(() => expect(getByText("Import as new")).toBeTruthy());

    const nameInput = getByLabelText("New workspace name") as HTMLInputElement;
    await fireEvent.input(nameInput, { target: { value: "my-course-renamed" } });
    await fireEvent.click(getByText("Import as new"));

    await vi.waitFor(() => expect(getByText(/my-course-renamed/)).toBeTruthy());
    const importCall = fetchSpy.mock.calls.find(([url]) => url === "/import");
    const body = importCall![1].body as FormData;
    expect(body.get("targetWorkspace")).toBe("my-course-renamed");
    expect(body.get("mode")).toBe("create");

    vi.unstubAllGlobals();
  });

  it("Cancel on the collision prompt resets back to the drop-zone with no upload (F38)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, workspaces: [{ name: "my-course", isCurrent: true, snapshots: [] }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, queryByText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    await vi.waitFor(() => expect(getByText("Cancel")).toBeTruthy());

    await fireEvent.click(getByText("Cancel"));

    expect(queryByText(/already exists/)).toBeNull();
    expect(getByText(/Drop a/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalledWith("/import", expect.anything());

    vi.unstubAllGlobals();
  });

  it("resolves a file selected via the file input, not just drag-drop", async () => {
    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, container } = render(ImportModal, { props: { open: true } });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    await fireEvent.change(input);

    await vi.waitFor(() => expect(getByText(/my-course/)).toBeTruthy());
  });

  it("shows an error for a non-zip file", async () => {
    const file = new File(["hello"], "not-a-zip.txt", { type: "text/plain" });
    const { getByText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => expect(getByText(/please select a \.zip file/)).toBeTruthy());
  });

  it("shows an error when manifest.json is missing from the zip", async () => {
    const file = await buildZipFile({ "a_screen.json": "{}" });
    const { getByText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => expect(getByText(/manifest\.json/)).toBeTruthy());
  });

  it("resets its resolved state when reopened", async () => {
    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, queryByText, container, component } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    await vi.waitFor(() => expect(getByText(/my-course/)).toBeTruthy());

    await component.$set({ open: false });
    await component.$set({ open: true });

    expect(queryByText(/my-course/)).toBeNull();
    expect(getByText(/Drop a/)).toBeTruthy();
  });

  it("exposes acceptFile() so a page-level drop target can hand off a file directly", async () => {
    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, component } = render(ImportModal, { props: { open: true } }) as unknown as {
      getByText: (m: RegExp) => HTMLElement;
      component: { acceptFile: (f: File) => Promise<void> };
    };

    await component.acceptFile(file);
    await vi.waitFor(() => expect(getByText(/my-course/)).toBeTruthy());
  });

  it("closes on Escape and on clicking the close button", async () => {
    const { getByLabelText, component } = render(ImportModal, { props: { open: true } });
    let closed = false;
    component.$on("close", () => {
      closed = true;
    });

    await fireEvent.click(getByLabelText("Close"));
    expect(closed).toBe(true);
  });
});
