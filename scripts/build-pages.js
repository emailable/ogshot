// Builds the static home page for GitHub Pages from the same source the Worker serves.
import { mkdirSync, writeFileSync } from "node:fs";
import { homePage } from "../src/home.js";

mkdirSync("dist/pages", { recursive: true });
writeFileSync("dist/pages/index.html", homePage({ mode: "static" }));
console.log("Wrote dist/pages/index.html");
