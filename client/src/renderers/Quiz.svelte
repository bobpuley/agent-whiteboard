<script lang="ts">
  import { scoreQuiz } from "../lib/quiz.js";
  import type { Quiz, QuizAnswer, QuizScore } from "../lib/quiz.js";

  // Quiz renderer (F44, F46 in docs/03 §10). `source` is the JSON payload
  // already validated server-side by server/quiz.ts; a snapshot reloaded from
  // disk is parsed defensively anyway.
  //
  // Mode is derived from the answer key (F45): every question has a correct
  // option → inline (this component scores locally on Submit); none → deferred
  // (Submit hands the answers to `onSubmit`, wired to the server in v1.8
  // Sprint 91 via the registry).
  export let source: string;
  // `instance` changes identity on every replace command (even for an identical
  // payload, e.g. reloading the same snapshot from history) so the quiz always
  // comes back fresh and unanswered.
  export let onSubmit: ((answers: QuizAnswer[], score?: QuizScore) => Promise<void>) | undefined = undefined;
  export let instance: unknown = undefined;

  let quiz: Quiz | null = null;
  let parseError: string | null = null;
  let inline = false;
  let selected: Record<string, string[]> = {};
  let score: QuizScore | null = null;
  let sending = false;
  let sent = false;
  let sendError = false;
  let lastSource: string | null = null;
  let lastInstance: unknown = undefined;

  function load(src: string, inst: unknown) {
    lastSource = src;
    lastInstance = inst;
    quiz = null;
    parseError = null;
    selected = {};
    score = null;
    sending = false;
    sent = false;
    sendError = false;
    try {
      const parsed = JSON.parse(src) as Quiz;
      if (!parsed || !Array.isArray(parsed.questions)) throw new Error("missing questions");
      quiz = parsed;
      inline = parsed.questions.length > 0 && parsed.questions.every((q) => q.options.some((o) => o.correct === true));
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  }

  $: if (source !== lastSource || instance !== lastInstance) load(source, instance);

  $: locked = score !== null || sent;
  $: allAnswered = quiz !== null && quiz.questions.every((q) => (selected[q.id]?.length ?? 0) > 0);

  function pickSingle(qid: string, oid: string) {
    selected = { ...selected, [qid]: [oid] };
  }

  function toggleMulti(qid: string, oid: string, checked: boolean) {
    const cur = selected[qid] ?? [];
    selected = { ...selected, [qid]: checked ? [...cur, oid] : cur.filter((id) => id !== oid) };
  }

  function buildAnswers(): QuizAnswer[] {
    return (quiz?.questions ?? []).map((q) => ({ questionId: q.id, selected: selected[q.id] ?? [] }));
  }

  async function submit() {
    if (!quiz || !allAnswered || locked || sending) return;
    const answers = buildAnswers();
    if (inline) {
      score = scoreQuiz(quiz, answers);
      // Best-effort: lets a pending wait_quiz() see the result; the on-screen score never depends on it.
      void onSubmit?.(answers, score).catch(() => {});
      return;
    }
    if (!onSubmit) return;
    sending = true;
    sendError = false;
    try {
      await onSubmit(answers);
      sent = true;
    } catch {
      sendError = true;
    } finally {
      sending = false;
    }
  }

  function fmt(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  }

  $: resultFor = (qid: string) => score?.results.find((r) => r.questionId === qid);
</script>

<div class="quiz-renderer">
  {#if parseError}
    <pre class="render-error">Invalid quiz: {parseError}</pre>
  {:else if quiz}
    <form on:submit|preventDefault={submit}>
      {#if quiz.title}<h2 class="quiz-title">{quiz.title}</h2>{/if}

      {#each quiz.questions as q, qi (q.id)}
        {@const result = resultFor(q.id)}
        <fieldset class="question" class:right={result?.correct} class:wrong={result && !result.correct} disabled={locked}>
          <legend>
            <span class="qnum">{qi + 1}.</span> {q.text}
            {#if q.kind === "multiple"}<span class="hint">(select all that apply)</span>{/if}
          </legend>
          {#each q.options as o (o.id)}
            <label class="option" class:correct-opt={score && o.correct} class:picked={selected[q.id]?.includes(o.id)}>
              {#if q.kind === "single"}
                <input type="radio" name={q.id} value={o.id} checked={selected[q.id]?.[0] === o.id} on:change={() => pickSingle(q.id, o.id)} />
              {:else}
                <input type="checkbox" name={q.id} value={o.id} checked={selected[q.id]?.includes(o.id) ?? false} on:change={(e) => toggleMulti(q.id, o.id, e.currentTarget.checked)} />
              {/if}
              <span>{o.text}</span>
            </label>
          {/each}
          {#if result}
            <p class="result" role="status">
              {result.correct ? "Correct" : result.earned > 0 ? "Partially correct" : "Incorrect"} — {fmt(result.earned)} / {fmt(result.possible)}
            </p>
          {/if}
        </fieldset>
      {/each}

      <div class="actions">
        {#if score}
          <p class="total" role="status">Score: {fmt(score.earned)} / {fmt(score.possible)}</p>
        {:else}
          <button type="submit" class="submit-btn" class:sent class:error={sendError} disabled={!allAnswered || sending || sent}>
            {#if sent}Sent ✓{:else if sendError}Failed — retry{:else if sending}Sending…{:else}Submit{/if}
          </button>
          {#if !allAnswered}<span class="hint">Answer every question to submit.</span>{/if}
        {/if}
      </div>
    </form>
  {/if}
</div>

<style>
  /* Fixed light palette on purpose: rendered content is never themed (F26) and sits on a light canvas even in dark mode. */
  .quiz-renderer { width: 100%; max-width: 760px; margin: 0 auto; padding: 24px; color: #333333; box-sizing: border-box; background: #ffffff; }
  .quiz-title { margin: 0 0 16px; font-size: 20px; color: #222222; }
  .question { border: 1px solid #d8d8d8; border-radius: 6px; padding: 12px 16px 8px; margin: 0 0 16px; }
  .question.right { border-color: #27ae60; background: #f0fff4; }
  .question.wrong { border-color: #e74c3c; background: #fdf0f0; }
  legend { font-weight: 600; padding: 0 6px; color: #222222; }
  .qnum { color: #888888; }
  .hint { font-weight: 400; font-size: 12px; color: #888888; margin-left: 6px; }
  .option { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-radius: 4px; cursor: pointer; }
  .option:hover { background: #f0f0f0; }
  .option.correct-opt span { font-weight: 600; color: #27ae60; }
  fieldset:disabled .option { cursor: default; }
  .result { margin: 8px 0 4px; font-size: 13px; color: #555555; }
  .actions { display: flex; align-items: center; gap: 12px; }
  .total { margin: 0; font-size: 18px; font-weight: 600; color: #222222; }
  .submit-btn { padding: 8px 20px; border: 1px solid #2980b9; border-radius: 4px; background: #2980b9; color: #fff; font-size: 14px; cursor: pointer; }
  .submit-btn:hover:not(:disabled) { background: #1f6699; }
  .submit-btn:disabled { background: #dddddd; border-color: #cccccc; color: #888888; cursor: not-allowed; }
  .submit-btn.sent { background: #27ae60; border-color: #27ae60; color: #fff; }
  .submit-btn.error { background: #e74c3c; border-color: #e74c3c; color: #fff; }
  .render-error { color: var(--board-danger-dark); background: var(--board-danger-bg); border: 1px solid var(--board-danger); border-radius: 4px; padding: 12px 16px; font-family: monospace; font-size: 13px; white-space: pre-wrap; }
</style>
