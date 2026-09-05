import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

const dev = process.env.ROLLUP_WATCH === "true";

export default {
  input: "src/room-climate-card.ts",
  output: {
    file: "dist/room-climate-card.js",
    format: "es",
    sourcemap: dev,
    // HACS dashboard repos serve exactly one file; dynamic imports must stay inline.
    inlineDynamicImports: true,
  },
  plugins: [
    nodeResolve(),
    json(),
    typescript({ tsconfig: "./tsconfig.json", outDir: undefined, declaration: false }),
    !dev && terser({ format: { comments: false } }),
  ].filter(Boolean),
};
