// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import Quiz from "../../../client/src/renderers/Quiz.svelte";
import { rendererRegistry } from "../../../client/src/renderers/registry.js";

const inlineQuiz = JSON.stringify({
  title: "Capitals",
  questions: [
    { id: "q1", text: "Capital of France?", kind: "single", options: [{ id: "a", text: "Paris", correct: true }, { id: "b", text: "Rome" }] },
    { id: "q2", text: "Pick primes", kind: "multiple", points: 2, options: [{ id: "a", text: "2", correct: true }, { id: "b", text: "3", correct: true }, { id: "c", text: "4" }] },
  ],
});

const deferredQuiz = JSON.stringify({
  questions: [{ id: "q1", text: "Explain?", kind: "single", options: [{ id: "a", text: "Yes" }, { id: "b", text: "No" }] }],
});

describe("Quiz.svelte (F44/F46)", () => {
  afterEach(() => cleanup());

  it("renders title, questions, radio for single and checkbox for multiple", () => {
    const { getByText, container } = render(Quiz, { props: { source: inlineQuiz } });
    expect(getByText("Capitals")).toBeTruthy();
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
  });

  it("keeps Submit disabled until every question is answered", async () => {
    const { getByRole, getByLabelText } = render(Quiz, { props: { source: inlineQuiz } });
    const submit = getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await fireEvent.click(getByLabelText("Paris"));
    expect(submit.disabled).toBe(true);
    await fireEvent.click(getByLabelText("2"));
    expect(submit.disabled).toBe(false);
    await fireEvent.click(getByLabelText("2")); // uncheck again
    expect(submit.disabled).toBe(true);
  });

  it("inline: Submit shows per-question results and the total score only after submit", async () => {
    const { getByRole, getByLabelText, queryByText, getAllByRole } = render(Quiz, { props: { source: inlineQuiz } });
    expect(queryByText(/Score:/)).toBeNull();
    await fireEvent.click(getByLabelText("Paris"));
    await fireEvent.click(getByLabelText("2"));
    await fireEvent.click(getByLabelText("3"));
    await fireEvent.click(getByRole("button", { name: "Submit" }));
    expect(queryByText("Score: 3 / 3")).toBeTruthy();
    expect(getAllByRole("status").map((e) => e.textContent?.trim())).toContain("Correct — 1 / 1");
  });

  it("inline: wrong answers score 0 and are marked incorrect; inputs lock", async () => {
    const { getByRole, getByLabelText, queryByText, container } = render(Quiz, { props: { source: inlineQuiz } });
    await fireEvent.click(getByLabelText("Rome"));
    await fireEvent.click(getByLabelText("2")); // incomplete set
    await fireEvent.click(getByRole("button", { name: "Submit" }));
    expect(queryByText("Score: 0 / 3")).toBeTruthy();
    expect(queryByText(/Incorrect — 0 \/ 1/)).toBeTruthy();
    expect(Array.from(container.querySelectorAll("fieldset")).every((f) => f.disabled)).toBe(true);
  });

  it("deferred: Submit calls onSubmit with the selected answers and shows Sent ✓", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { getByRole, getByLabelText, queryByText } = render(Quiz, { props: { source: deferredQuiz, onSubmit } });
    await fireEvent.click(getByLabelText("No"));
    await fireEvent.click(getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(queryByText("Sent ✓")).toBeTruthy());
    expect(onSubmit).toHaveBeenCalledWith([{ questionId: "q1", selected: ["b"] }]);
    expect(queryByText(/Score:/)).toBeNull(); // client never scores deferred quizzes
  });

  it("deferred: a failed send shows a retry state and allows resubmitting", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(undefined);
    const { getByRole, getByLabelText, queryByText } = render(Quiz, { props: { source: deferredQuiz, onSubmit } });
    await fireEvent.click(getByLabelText("Yes"));
    await fireEvent.click(getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(queryByText("Failed — retry")).toBeTruthy());
    await fireEvent.click(getByRole("button", { name: "Failed — retry" }));
    await waitFor(() => expect(queryByText("Sent ✓")).toBeTruthy());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("resets answers and results when the source changes", async () => {
    const { getByLabelText, component, queryByText, container } = render(Quiz, { props: { source: inlineQuiz } });
    await fireEvent.click(getByLabelText("Paris"));
    component.$set({ source: deferredQuiz });
    await waitFor(() => expect(queryByText("Explain?")).toBeTruthy());
    expect(container.querySelectorAll("input:checked")).toHaveLength(0);
  });

  it("inline: also reports answers and score to onSubmit (best-effort), without blocking the on-screen score", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("offline"));
    const { getByRole, getByLabelText, queryByText } = render(Quiz, { props: { source: inlineQuiz, onSubmit } });
    await fireEvent.click(getByLabelText("Paris"));
    await fireEvent.click(getByLabelText("2"));
    await fireEvent.click(getByLabelText("3"));
    await fireEvent.click(getByRole("button", { name: "Submit" }));
    expect(queryByText("Score: 3 / 3")).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith(
      [{ questionId: "q1", selected: ["a"] }, { questionId: "q2", selected: ["a", "b"] }],
      expect.objectContaining({ earned: 3, possible: 3 }),
    );
  });

  it("starts fresh when the same payload is re-delivered as a new instance (e.g. history reload)", async () => {
    const first = {};
    const { getByRole, getByLabelText, component, queryByText } = render(Quiz, { props: { source: inlineQuiz, instance: first } });
    await fireEvent.click(getByLabelText("Paris"));
    await fireEvent.click(getByLabelText("2"));
    await fireEvent.click(getByLabelText("3"));
    await fireEvent.click(getByRole("button", { name: "Submit" }));
    expect(queryByText(/Score:/)).toBeTruthy();
    component.$set({ instance: {} });
    await waitFor(() => expect(queryByText(/Score:/)).toBeNull());
  });

  it("shows an error for an unparsable payload instead of throwing", () => {
    const { container } = render(Quiz, { props: { source: "not json" } });
    expect(container.querySelector(".render-error")?.textContent).toMatch(/Invalid quiz/);
  });

  it("is registered and maps the first frame's payload to source", async () => {
    const Component = await rendererRegistry.quiz.load();
    expect(Component).toBe(Quiz);
    const presentation = { cursor: 0, frames: [{ type: "quiz", payload: deferredQuiz }] };
    const props = rendererRegistry.quiz.props({ clickable: false, nodeActions: undefined, nodeToFrameEnabled: false, currentFrame: 0, presentation });
    expect(props).toMatchObject({ source: deferredQuiz, instance: presentation });
    expect(typeof props.onSubmit).toBe("function");
  });
});
