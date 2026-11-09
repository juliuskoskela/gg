import { NeovimGrid } from "./grid";

// glyphs are rasterized once into an atlas; WebGL composites the grid in two draws.
export class GridRenderer {
    gl: WebGL2RenderingContext;
    program: WebGLProgram;
    texture: WebGLTexture;
    buffer: WebGLBuffer;
    atlas = document.createElement("canvas");
    glyphs = new Map<string, number>();
    cellWidth = 8;
    cellHeight = 20;
    fontSize = 12;
    fontFamily = "monospace";
    scale = 1;
    tileWidth = 16;
    tileHeight = 32;
    constructor(public canvas: HTMLCanvasElement, public grid: NeovimGrid) {
        let gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
        if (!gl) throw Error("WebGL 2 is unavailable. The diff viewer remains available.");
        this.gl = gl;
        let shader = (type: number, source: string) => {
            let shader = gl.createShader(type)!;
            gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader) ?? "Shader compilation failed");
            return shader;
        };
        this.program = gl.createProgram()!;
        let vertex = shader(gl.VERTEX_SHADER, `#version 300 es
        in vec2 position; in vec2 uv; in vec4 color; uniform vec2 size;
        out vec2 texCoord; out vec4 tint;
        void main(){gl_Position=vec4(position/size*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);texCoord=uv;tint=color;}`);
        let fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
        precision mediump float; in vec2 texCoord; in vec4 tint; uniform sampler2D atlas; uniform bool glyph;
        out vec4 outColor; void main(){outColor=vec4(tint.rgb,tint.a*(glyph?texture(atlas,texCoord).a:1.));}`);
        gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
        gl.deleteShader(vertex); gl.deleteShader(fragment);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw Error("Could not initialize the editor renderer");
        this.texture = gl.createTexture()!; this.buffer = gl.createBuffer()!;
        gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        for (let [name, count, offset] of [["position", 2, 0], ["uv", 2, 8], ["color", 4, 16]] as const) {
            let location = gl.getAttribLocation(this.program, name);
            gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, count, gl.FLOAT, false, 32, offset);
        }
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    resize(width: number, height: number, style: CSSStyleDeclaration) {
        let fontSize = parseFloat(style.fontSize), family = style.fontFamily, scale = window.devicePixelRatio || 1;
        let changed = fontSize !== this.fontSize || family !== this.fontFamily || scale !== this.scale || !this.atlas.width;
        this.fontSize = fontSize; this.fontFamily = family; this.scale = scale;
        let context = this.atlas.getContext("2d")!;
        /* design-token-allow typography: canvas measurement uses the computed editor font */
        context.font = `${fontSize}px ${family}`;
        this.cellWidth = context.measureText("M").width;
        this.cellHeight = parseFloat(style.lineHeight) || fontSize * 1.6667;
        this.canvas.width = Math.max(1, Math.round(width * scale)); this.canvas.height = Math.max(1, Math.round(height * scale));
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        if (changed) {
            this.tileWidth = Math.ceil(this.cellWidth * scale * 2) + 4;
            this.tileHeight = Math.ceil(this.cellHeight * scale) + 4;
            this.atlas.width = this.tileWidth * 32; this.atlas.height = this.tileHeight * 64;
            this.glyphs.clear();
        }
        return { cols: Math.max(12, Math.floor(width / this.cellWidth)), rows: Math.max(3, Math.floor(height / this.cellHeight)) };
    }
    render() {
        let gl = this.gl, backgrounds: number[] = [], glyphs: number[] = [], dirty = false;
        let quad = (list: number[], x: number, y: number, width: number, height: number, color: number, u = 0, v = 0, uw = 0, vh = 0) => {
            let rgb = [(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255, 1];
            for (let [dx, dy] of [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]]) list.push(x + dx * width, y + dy * height, u + dx * uw, v + dy * vh, ...rgb);
        };
        for (let [rowIndex, row] of this.grid.rows.entries()) for (let [col, cell] of row.entries()) {
            let hl = this.grid.highlights.get(cell.hl) ?? {};
            let fg = hl.foreground ?? this.grid.foreground, bg = hl.background ?? this.grid.background;
            if (hl.reverse) [fg, bg] = [bg, fg];
            if (rowIndex === this.grid.cursor.row && col === this.grid.cursor.col) [fg, bg] = [this.grid.background, this.grid.foreground];
            let x = col * this.cellWidth, y = rowIndex * this.cellHeight;
            quad(backgrounds, x, y, this.cellWidth, this.cellHeight, bg);
            if (!cell.text.trim()) continue;
            let key = `${cell.text}:${!!hl.bold}:${!!hl.italic}`;
            let index = this.glyphs.get(key);
            if (index === undefined) {
                if (this.glyphs.size >= 2048) continue;
                index = this.glyphs.size; this.glyphs.set(key, index); dirty = true;
                let context = this.atlas.getContext("2d")!;
                /* design-token-allow typography: grid glyphs use Neovim attributes and the computed editor font */
                context.font = `${hl.italic ? "italic " : ""}${hl.bold ? "600 " : "400 "}${this.fontSize * this.scale}px ${this.fontFamily}`;
                /* design-token-allow color: the glyph atlas stores alpha masks; final color comes from Neovim */
                context.fillStyle = "white"; context.textBaseline = "alphabetic";
                context.fillText(cell.text, index % 32 * this.tileWidth + 2, Math.floor(index / 32) * this.tileHeight + 2 + (this.cellHeight - this.fontSize) / 2 * this.scale + this.fontSize * this.scale * .8);
            }
            quad(glyphs, x - 2 / this.scale, y - 2 / this.scale, this.tileWidth / this.scale, this.tileHeight / this.scale, fg, index % 32 / 32, Math.floor(index / 32) / 64, 1 / 32, 1 / 64);
            if (hl.underline) quad(backgrounds, x, y + this.cellHeight - 2, this.cellWidth, 1, hl.special ?? fg);
        }
        gl.useProgram(this.program);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        if (dirty) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas);
        gl.uniform2f(gl.getUniformLocation(this.program, "size"), this.canvas.width / this.scale, this.canvas.height / this.scale);
        let bg = this.grid.background;
        gl.clearColor((bg >> 16 & 255) / 255, (bg >> 8 & 255) / 255, (bg & 255) / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        for (let [data, glyph] of [[backgrounds, false], [glyphs, true]] as const) {
            gl.uniform1i(gl.getUniformLocation(this.program, "glyph"), +glyph);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, data.length / 8);
        }
    }
    destroy() { this.gl.deleteTexture(this.texture); this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program); }
}
