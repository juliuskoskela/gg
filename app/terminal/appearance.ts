import type { CanvasRenderer, GhosttyCell, IRenderable, ITheme, Terminal } from "ghostty-web";

type Scrollback = NonNullable<Parameters<CanvasRenderer["render"]>[3]>;
let colors: (keyof ITheme)[] = ["foreground", "background", "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
    "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"];

/** Adapt 0.4's resolved cell colours without restarting its parser or the shell. */
export function terminalAppearance(terminal: Terminal, initial: ITheme): (theme: ITheme) => void {
    let renderer = terminal.renderer!;
    let render = renderer.render.bind(renderer);
    let replacements = new Map<number, number>();
    let rgb = (value: string) => parseInt(value.slice(1), 16);
    let remap = (r: number, g: number, b: number) => replacements.get((r << 16) | (g << 8) | b);
    let cells = (line: GhosttyCell[] | null): GhosttyCell[] | null => {
        if (!line || !replacements.size) return line;
        return line.map(cell => {
            let foreground = remap(cell.fg_r, cell.fg_g, cell.fg_b);
            let background = remap(cell.bg_r, cell.bg_g, cell.bg_b);
            if (foreground === undefined && background === undefined) return cell;
            return { ...cell,
                ...(foreground === undefined ? {} : { fg_r: foreground >> 16, fg_g: (foreground >> 8) & 255, fg_b: foreground & 255 }),
                ...(background === undefined ? {} : { bg_r: background >> 16, bg_g: (background >> 8) & 255, bg_b: background & 255 }),
            };
        });
    };
    renderer.render = (buffer, force, viewport, scrollback, opacity) => {
        let mapped: IRenderable = {
            getLine: row => cells(buffer.getLine(row)),
            getCursor: () => buffer.getCursor(),
            getDimensions: () => buffer.getDimensions(),
            isRowDirty: row => buffer.isRowDirty(row),
            needsFullRedraw: () => buffer.needsFullRedraw?.() ?? false,
            clearDirty: () => buffer.clearDirty(),
            getGraphemeString: buffer.getGraphemeString?.bind(buffer),
        };
        let history: Scrollback | undefined = scrollback && {
            getScrollbackLine: row => cells(scrollback.getScrollbackLine(row)),
            getScrollbackLength: () => scrollback.getScrollbackLength(),
        };
        render(mapped, force, viewport, history, opacity);
    };
    return theme => {
        replacements.clear();
        for (let key of colors) {
            if (initial[key] && theme[key] && initial[key] !== theme[key]) replacements.set(rgb(initial[key]!), rgb(theme[key]!));
        }
        renderer.setTheme(theme);
        if (terminal.wasmTerm) renderer.render(terminal.wasmTerm, true, terminal.viewportY, terminal);
    };
}
