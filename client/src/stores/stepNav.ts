// Step navigation — calls the server REST fallback to drive cursor.
export async function stepNav(direction: "next" | "prev"): Promise<void> {
  await fetch("/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction }),
  });
}
