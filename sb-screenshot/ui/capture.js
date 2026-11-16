export function fail(code) {
  return { status: "error", error: { code, message: code } };
}

export function options(url, input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_options");
  const target = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (
    (target.protocol !== "https:" && !(target.protocol === "http:" && local)) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    !/^\/api\/v1\/file\/presigned-url\/[A-Za-z0-9_.-]+$/.test(target.pathname)
  )
    throw new Error("invalid_options");
  const value = {
    encoding: input.encoding ?? "png",
    quality: input.quality ?? 0.9,
    maxWidth: input.maxWidth ?? 1920,
    maxHeight: input.maxHeight ?? 1080,
    maxBytes: input.maxBytes ?? 6 * 1024 * 1024,
    timeoutMs: input.timeoutMs ?? 10000,
  };
  if (
    !["png", "jpg", "webp"].includes(value.encoding) ||
    !Number.isFinite(value.quality) ||
    value.quality < 0 ||
    value.quality > 1 ||
    !Number.isInteger(value.maxWidth) ||
    value.maxWidth < 1 ||
    value.maxWidth > 7680 ||
    !Number.isInteger(value.maxHeight) ||
    value.maxHeight < 1 ||
    value.maxHeight > 4320 ||
    !Number.isInteger(value.maxBytes) ||
    value.maxBytes < 1 ||
    value.maxBytes > 16 * 1024 * 1024 ||
    !Number.isInteger(value.timeoutMs) ||
    value.timeoutMs < 1 ||
    value.timeoutMs > 30000
  )
    throw new Error("invalid_options");
  return value;
}

export async function result(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("invalid_response");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 65536) throw new Error("invalid_response");
      chunks.push(next.value);
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
  if (!response.ok) throw new Error("upload_failed");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("invalid_response");
  }
  if (
    value?.status !== "ok" ||
    typeof value.data?.id !== "string" ||
    !value.data.id ||
    typeof value.data.url !== "string"
  ) {
    throw new Error("invalid_response");
  }
  return { status: "ok", data: value.data };
}

export class Capture {
  constructor(frame, send, report) {
    this.frame = frame;
    this.send = send;
    this.report = report;
    this.active = null;
    this.stopped = false;
  }

  async run(request) {
    if (typeof request?.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(request.id)) return;
    if (this.stopped || this.active) {
      this.report(request.id, fail(this.stopped ? "unavailable" : "busy"));
      return;
    }
    let config;
    try {
      config = options(request.url, request.options);
    } catch {
      this.report(request.id, fail("invalid_options"));
      return;
    }
    const controller = new AbortController();
    const job = { id: request.id, controller, reported: false };
    this.active = job;
    const finish = (value) => {
      if (job.reported) return;
      job.reported = true;
      this.report(job.id, value);
    };
    controller.signal.addEventListener("abort", () => finish(fail(controller.signal.reason)), { once: true });
    const timer = setTimeout(() => controller.abort("timeout"), config.timeoutMs);
    try {
      const blob = await this.frame.take(config, controller.signal);
      if (controller.signal.aborted) return;
      if (!blob?.size) throw new Error("capture_failed");
      if (blob.size > config.maxBytes) throw new Error("file_too_large");
      const mime = config.encoding === "jpg" ? "image/jpeg" : `image/${config.encoding}`;
      if (blob.type !== mime) throw new Error("capture_failed");
      const body = new FormData();
      body.append("file", blob, `screenshot.${config.encoding}`);
      const send = this.send;
      let response;
      try {
        response = await send(request.url, {
          method: "POST",
          body,
          signal: controller.signal,
          redirect: "error",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
      } catch {
        throw new Error("upload_failed");
      }
      const value = await result(response);
      if (!controller.signal.aborted) finish(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = [
        "capture_failed",
        "file_too_large",
        "upload_failed",
        "invalid_response",
        "unavailable",
      ].includes(message)
        ? message
        : "capture_failed";
      finish(fail(controller.signal.aborted ? controller.signal.reason : code));
    } finally {
      clearTimeout(timer);
      if (this.active === job) this.active = null;
    }
  }

  cancel(id) {
    if (this.active?.id === id) this.active.controller.abort("cancelled");
  }

  stop() {
    this.stopped = true;
    this.active?.controller.abort("unavailable");
    this.frame.dispose();
  }
}
