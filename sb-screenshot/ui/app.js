import { Capture } from "./capture.js";
import { Frame } from "./frame.js";

const resource = GetParentResourceName();
async function notify(name, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`https://${resource}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("callback_failed");
  } catch {
    console.error("sb-screenshot: callback_failed");
  } finally {
    clearTimeout(timer);
  }
}

const capture = new Capture(new Frame(), fetch, (id, value) => {
  void notify("result", { id, ...value });
});
window.addEventListener("message", (event) => {
  const request = event.data;
  if (request?.action === "capture") void capture.run(request);
  else if (request?.action === "cancel") capture.cancel(request.id);
  else if (request?.action === "stop") capture.stop();
});
window.addEventListener("pagehide", () => capture.stop(), { once: true });
void notify("ready", {});
