export function dimensions(width, height, config) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1)
    throw new Error("capture_failed");
  const scale = Math.min(1, config.maxWidth / width, config.maxHeight / height);
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

const FLOOR = 0.3;

export async function pack(encode, config, signal) {
  let quality = config.quality;
  let blob = await encode(quality);
  signal.throwIfAborted();
  for (
    let tries = 0;
    config.encoding !== "png" && blob && blob.size > config.maxBytes && quality > FLOOR && tries < 4;
    tries++
  ) {
    quality = Math.max(FLOOR, quality * 0.75);
    blob = await encode(quality);
    signal.throwIfAborted();
  }
  return blob;
}

export class Frame {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.output = document.createElement("canvas");
    this.context = this.output.getContext("2d", { alpha: false });
    this.gl = this.canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.program = null;
    this.texture = null;
    this.buffer = null;
    this.lost = false;
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.program = null;
      this.texture = null;
      this.buffer = null;
      this.lost = false;
    });
  }

  shader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error("unavailable");
    }
    return shader;
  }

  init() {
    const gl = this.gl;
    if (!gl || !this.context || this.lost || gl.isContextLost()) throw new Error("unavailable");
    if (this.program) return;
    const shaders = [];
    try {
      shaders.push(
        this.shader(
          gl.VERTEX_SHADER,
          "attribute vec2 position; varying vec2 uv; void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }",
        ),
      );
      shaders.push(
        this.shader(
          gl.FRAGMENT_SHADER,
          "precision mediump float; varying vec2 uv; uniform sampler2D game; void main() { gl_FragColor = vec4(texture2D(game, uv).rgb, 1.0); }",
        ),
      );
      this.program = gl.createProgram();
      for (const shader of shaders) gl.attachShader(this.program, shader);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error("unavailable");
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255]),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  next(signal) {
    return new Promise((resolve, reject) => {
      const abort = () => {
        cancelAnimationFrame(frame);
        reject(new Error("cancelled"));
      };
      const frame = requestAnimationFrame(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      });
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  attach() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  async take(config, signal) {
    signal.throwIfAborted();
    await this.next(signal);
    signal.throwIfAborted();
    this.init();
    this.attach();
    await this.next(signal);
    signal.throwIfAborted();
    if (!this.program) throw new Error("capture_failed");
    const size = dimensions(window.innerWidth, window.innerHeight, config);
    const gl = this.gl;
    this.canvas.width = this.output.width = size.width;
    this.canvas.height = this.output.height = size.height;
    gl.viewport(0, 0, size.width, size.height);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const position = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.attach();
    gl.uniform1i(gl.getUniformLocation(this.program, "game"), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (this.lost || gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error("capture_failed");
    this.context.drawImage(this.canvas, 0, 0);
    const mime = config.encoding === "jpg" ? "image/jpeg" : `image/${config.encoding}`;
    const blob = await pack(
      (quality) => new Promise((resolve) => this.output.toBlob(resolve, mime, quality)),
      config,
      signal,
    );
    if (!blob || this.lost) throw new Error("capture_failed");
    return blob;
  }

  dispose() {
    const gl = this.gl;
    if (gl) {
      if (this.texture) gl.deleteTexture(this.texture);
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.texture = this.buffer = this.program = null;
    this.canvas.width = this.canvas.height = this.output.width = this.output.height = 1;
  }
}
