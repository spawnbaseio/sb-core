const self = GetCurrentResourceName();
let ready = false;
let stopped = false;
let active = null;
let sequence = 0;

function fail(code) {
  return { status: "error", error: { code, message: code } };
}

function finish(result) {
  const request = active;
  if (!request) return;
  active = null;
  clearTimeout(request.timer);
  try {
    request.callback(result);
  } catch {
    console.error("sb-screenshot: callback_failed");
  }
}

for (const name of ["ready", "result"]) RegisterNuiCallbackType(name);

on("__cfx_nui:ready", (_data, reply) => {
  reply({ status: "ok" });
  ready = !stopped;
});

on("__cfx_nui:result", (data, reply) => {
  reply({ status: "ok" });
  if (!active || data?.id !== active.id) return;
  if (data.status === "ok" && typeof data.data?.id === "string") {
    finish({ status: "ok", data: data.data });
  } else {
    const codes = [
      "busy",
      "timeout",
      "cancelled",
      "capture_failed",
      "file_too_large",
      "upload_failed",
      "invalid_response",
      "invalid_options",
      "unavailable",
    ];
    finish(fail(codes.includes(data.error?.code) ? data.error.code : "capture_failed"));
  }
});

exports("capture", (url, options, callback) => {
  if (typeof callback !== "function") return null;
  if (stopped || !ready || active) {
    callback(fail(active ? "busy" : "unavailable"));
    return null;
  }
  const timeoutMs = options?.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    callback(fail("invalid_options"));
    return null;
  }
  const id = `${GetGameTimer()}_${++sequence}`;
  const owner = GetInvokingResource();
  const timer = setTimeout(() => {
    if (active?.id !== id) return;
    SendNuiMessage(JSON.stringify({ action: "cancel", id }));
    finish(fail("timeout"));
  }, timeoutMs);
  active = { id, owner, callback, timer };
  SendNuiMessage(JSON.stringify({ action: "capture", id, url, options: { ...options, timeoutMs } }));
  return id;
});

exports("cancel", (id) => {
  if (!active || active.id !== id || active.owner !== GetInvokingResource()) return false;
  SendNuiMessage(JSON.stringify({ action: "cancel", id }));
  finish(fail("cancelled"));
  return true;
});

exports("status", () => ({ ready: ready && !stopped, active: active !== null }));

on("onClientResourceStop", (name) => {
  if (name === self) {
    stopped = true;
    ready = false;
    SendNuiMessage(JSON.stringify({ action: "stop" }));
    finish(fail("unavailable"));
  } else if (active?.owner === name) {
    SendNuiMessage(JSON.stringify({ action: "cancel", id: active.id }));
    finish(fail("cancelled"));
  }
});
