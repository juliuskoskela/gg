import type { ITheme } from "ghostty-web";

// resolve color-mix/light-dark through the browser before handing sRGB to Ghostty.
export function terminalTheme(host: HTMLElement): ITheme {
    let probe = document.createElement("span");
    let canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    let context = canvas.getContext("2d", { willReadFrequently: true })!;
    host.append(probe);
    let color = (token: string) => {
        probe.style.color = `var(${token})`;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(probe).color;
        context.fillRect(0, 0, 1, 1);
        return "#" + [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
            .map(value => value.toString(16).padStart(2, "0")).join("");
    };
    let theme: ITheme = {
        foreground: color("--text"), background: color("--surface"),
        cursor: color("--text"), cursorAccent: color("--surface"),
        selectionBackground: color("--selection-bg"), selectionForeground: color("--text"),
        black: color("--surface"), red: color("--negative"), green: color("--positive"),
        yellow: color("--warning"), blue: color("--accent"), magenta: color("--palette-keyword"),
        cyan: color("--palette-function"), white: color("--text"),
        brightBlack: color("--muted"), brightRed: color("--negative"), brightGreen: color("--positive"),
        brightYellow: color("--warning"), brightBlue: color("--accent"), brightMagenta: color("--palette-keyword"),
        brightCyan: color("--palette-function"), brightWhite: color("--text"),
    };
    probe.remove();
    return theme;
}
