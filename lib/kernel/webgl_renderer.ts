import { VRAM_BASE, VRAM_COLS, VRAM_ROWS } from './constants';
import { createVgaFontBitmap, getLinuxFontData, VGA_FONT_WIDTH, VGA_FONT_HEIGHT } from './vga_font';

const VERTEX_SHADER_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = (a_position + 1.0) * 0.5;
    v_uv.y = 1.0 - v_uv.y; // Flip Y for text coordinate orientation
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision mediump float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_vram;
uniform sampler2D u_font;
uniform vec2 u_cursor; // (col, row)
uniform bool u_cursor_visible;

// Standard 16 VGA Colors
const vec3 VGA_COLORS[16] = vec3[16](
    vec3(0.000, 0.000, 0.000), // 0: Black
    vec3(0.000, 0.000, 0.667), // 1: Blue
    vec3(0.000, 0.667, 0.000), // 2: Green
    vec3(0.000, 0.667, 0.667), // 3: Cyan
    vec3(0.667, 0.000, 0.000), // 4: Red
    vec3(0.667, 0.000, 0.667), // 5: Magenta
    vec3(0.667, 0.333, 0.000), // 6: Brown
    vec3(0.667, 0.667, 0.667), // 7: Light Gray
    vec3(0.333, 0.333, 0.333), // 8: Dark Gray
    vec3(0.333, 0.333, 1.000), // 9: Bright Blue
    vec3(0.333, 1.000, 0.333), // A: Bright Green
    vec3(0.333, 1.000, 1.000), // B: Bright Cyan
    vec3(1.000, 0.333, 0.333), // C: Bright Red
    vec3(1.000, 0.333, 1.000), // D: Bright Magenta
    vec3(1.000, 1.000, 0.333), // E: Yellow
    vec3(1.000, 1.000, 1.000)  // F: White
);

void main() {
    // Determine cell index (0..79, 0..24)
    vec2 cellCoord = floor(v_uv * vec2(80.0, 25.0));
    vec2 cellUV = fract(v_uv * vec2(80.0, 25.0));

    // Sample VRAM texture (at cell center)
    vec2 vramUV = (cellCoord + 0.5) / vec2(80.0, 25.0);
    vec4 vramData = texture(u_vram, vramUV);

    int charCode = int(vramData.r * 255.0 + 0.5);
    int attrByte = int(vramData.g * 255.0 + 0.5);

    int fgIdx = attrByte & 0x0F;
    int bgIdx = (attrByte >> 4) & 0x0F;

    vec3 fgColor = VGA_COLORS[fgIdx];
    vec3 bgColor = VGA_COLORS[bgIdx];

    // Compute exact pixel inside the 8x16 glyph
    vec2 pixelInGlyph = floor(cellUV * vec2(8.0, 16.0));
    pixelInGlyph = clamp(pixelInGlyph, vec2(0.0), vec2(7.0, 15.0));

    // Glyph cell position in the 16x16 grid
    int glyphCol = charCode % 16;
    int glyphRow = charCode / 16;

    // Exact texel coordinate in the 128x256 font atlas
    vec2 atlasPixel = vec2(float(glyphCol * 8), float(glyphRow * 16)) + pixelInGlyph;
    vec2 fontUV = (atlasPixel + 0.5) / vec2(128.0, 256.0);

    float glyphAlpha = texture(u_font, fontUV).r;

    // Check hardware VGA cursor (bottom scanlines 13..15)
    bool isCursor = (int(cellCoord.x) == int(u_cursor.x) && 
                     int(cellCoord.y) == int(u_cursor.y) && 
                     u_cursor_visible);

    if (isCursor && pixelInGlyph.y >= 13.0) {
        fragColor = vec4(fgColor, 1.0);
    } else {
        vec3 finalColor = mix(bgColor, fgColor, glyphAlpha);
        fragColor = vec4(finalColor, 1.0);
    }
}
`;

export class WebGL2VGARenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vramTexture: WebGLTexture | null = null;
  private fontTexture: WebGLTexture | null = null;
  private vramBuffer: Uint8Array;
  private isFallback: boolean = false;
  private ctx2d: CanvasRenderingContext2D | null = null;

  constructor() {
    this.vramBuffer = new Uint8Array(VRAM_COLS * VRAM_ROWS * 2);
  }

  public init(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });

    if (!gl) {
      console.warn('WebGL2 not available, falling back to 2D context');
      this.isFallback = true;
      this.ctx2d = canvas.getContext('2d');
      return true;
    }

    this.gl = gl;
    this.isFallback = false;

    // Compile shaders
    const vert = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const frag = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vert || !frag) return false;

    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return false;
    }
    this.program = prog;

    // Fullscreen quad geometry
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Font Texture (Authentic Linux Kernel 8x16 font atlas)
    this.fontTexture = this.createFontTexture(gl);

    // VRAM Texture: 80x25, 2 channels (R: char, G: attr)
    this.vramTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.vramTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_vram'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_font'), 1);

    return true;
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  // Upload authentic Linux Kernel 8x16 font atlas into single-channel R8 texture
  private createFontTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
    const fontBitmap = createVgaFontBitmap();
    const tex = gl.createTexture();
    if (!tex) return null;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      128,
      256,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      fontBitmap
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  public render(memory: Uint8Array, cursorCol: number, cursorRow: number, cursorVisible: boolean): void {
    if (this.isFallback && this.ctx2d) {
      this.renderFallback(memory, cursorCol, cursorRow, cursorVisible);
      return;
    }

    const gl = this.gl;
    if (!gl || !this.program || !this.vramTexture || !this.fontTexture) return;

    // Pack 80x25 characters & attributes into RG buffer
    for (let r = 0; r < VRAM_ROWS; r++) {
      for (let c = 0; c < VRAM_COLS; c++) {
        const offset = VRAM_BASE + (r * VRAM_COLS + c) * 2;
        const bufOffset = (r * VRAM_COLS + c) * 2;
        this.vramBuffer[bufOffset] = memory[offset];         // R = char
        this.vramBuffer[bufOffset + 1] = memory[offset + 1]; // G = attr
      }
    }

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(this.program);

    // Upload VRAM texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.vramTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG8,
      VRAM_COLS,
      VRAM_ROWS,
      0,
      gl.RG,
      gl.UNSIGNED_BYTE,
      this.vramBuffer
    );

    // Bind font texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);

    // Uniforms
    gl.uniform2f(gl.getUniformLocation(this.program, 'u_cursor'), cursorCol, cursorRow);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_cursor_visible'), cursorVisible ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private renderFallback(memory: Uint8Array, cursorCol: number, cursorRow: number, cursorVisible: boolean): void {
    const ctx = this.ctx2d;
    if (!ctx) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const fontData = getLinuxFontData();
    const cellW = ctx.canvas.width / VRAM_COLS;
    const cellH = ctx.canvas.height / VRAM_ROWS;
    const scaleX = cellW / VGA_FONT_WIDTH;
    const scaleY = cellH / VGA_FONT_HEIGHT;

    for (let r = 0; r < VRAM_ROWS; r++) {
      for (let c = 0; c < VRAM_COLS; c++) {
        const offset = VRAM_BASE + (r * VRAM_COLS + c) * 2;
        const charCode = memory[offset];
        const attrByte = memory[offset + 1];
        if (charCode === 0 && attrByte === 0) continue;

        const charOffset = charCode * VGA_FONT_HEIGHT;
        ctx.fillStyle = '#AAAAAA';

        for (let y = 0; y < VGA_FONT_HEIGHT; y++) {
          const rowByte = fontData[charOffset + y] || 0;
          for (let x = 0; x < VGA_FONT_WIDTH; x++) {
            if ((rowByte >> (7 - x)) & 1) {
              ctx.fillRect(c * cellW + x * scaleX, r * cellH + y * scaleY, scaleX, scaleY);
            }
          }
        }
      }
    }

    if (cursorVisible) {
      ctx.fillStyle = '#AAAAAA';
      ctx.fillRect(cursorCol * cellW, cursorRow * cellH + cellH - 3, cellW, 3);
    }
  }
}
