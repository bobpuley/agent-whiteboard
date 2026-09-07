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
  });

  it("shows the drop-zone / file picker when open with no file yet", () => {
    const { getByText } = render(ImportModal, { props: { open: true } });
    expect(getByText(/Drop a/)).toBeTruthy();
  });

  it("resolves and shows the workspace name from a dropped zip's manifest.json, with no network request (F37)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const file = await buildZipFile({ "manifest.json": VALID_MANIFEST });
    const { getByText, container } = render(ImportModal, { props: { open: true } });

    const dropZone = container.querySelector(".drop-zone")!;
    await fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await vi.waitFor(() => expect(getByText(/my-course/)).toBeTruthy());
    expect(getByText(/2 snapshots/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();

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
