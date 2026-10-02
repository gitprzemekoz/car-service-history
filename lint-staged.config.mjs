// Pre-commit gate on staged files (run by .husky/pre-commit). Commands in one array run in order.
// Typecheck is whole-project and cannot take a file list, so it runs once, only when code is staged;
// `astro check` matches CI and also covers .astro files.

/** @param {string[]} files */
const quote = (files) => files.map((f) => JSON.stringify(f)).join(" ");

/** @type {import("lint-staged").Configuration} */
export default {
  "*.{ts,tsx,astro}": [
    "eslint --fix",
    () => "astro check",
    /** @param {string[]} files */
    (files) => {
      const code = files.filter((f) => /\.tsx?$/.test(f));
      return code.length > 0 ? `vitest related --run ${quote(code)}` : [];
    },
  ],
  "*.{json,css,md}": "prettier --write",
};
