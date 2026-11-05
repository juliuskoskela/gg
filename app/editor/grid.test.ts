import { describe, it, expect } from "vitest";
import { NeovimGrid } from "./grid";

describe("Neovim line grid", () => {
    it("applies repeated cells, inherited highlights and complete flushes", () => {
        let grid = new NeovimGrid();
        expect(grid.apply([["grid_resize", [1, 4, 2]], ["grid_line", [1, 0, 0, [["a", 7, 2], ["b"], ["c", 2]]]]])).toBe(false);
        expect(grid.rows[0]).toEqual([{ text: "a", hl: 7 }, { text: "a", hl: 7 }, { text: "b", hl: 7 }, { text: "c", hl: 2 }]);
        expect(grid.apply([["flush", []]])).toBe(true);
    });
    it("scrolls a bounded region without corrupting neighboring cells", () => {
        let grid = new NeovimGrid();
        grid.apply([["grid_resize", [1, 3, 3]], ["grid_line", [1, 0, 0, [["a", 1, 3]]], [1, 1, 0, [["b", 2, 3]]], [1, 2, 0, [["c", 3, 3]]]], ["grid_scroll", [1, 0, 3, 1, 3, 1, 0]]]);
        expect(grid.rows.map(row => row.map(cell => cell.text).join(""))).toEqual(["abb", "bcc", "c  "]);
    });
});
