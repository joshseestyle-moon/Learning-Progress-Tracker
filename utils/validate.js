// Small shared input helpers.

// Trim a string and enforce a max length. Returns { value, tooLong }.
// Non-string input is coerced to '' (callers decide if empty is an error).
function clampText(input, max) {
  const s = (input == null ? '' : String(input)).trim();
  return { value: s.slice(0, max), tooLong: s.length > max };
}

// Field length limits used across routes.
const LIMITS = {
  name:  100,   // subject / reward / badge / chapter titles
  title: 200,   // assignment / task / exam titles
  note:  1000,  // free-form notes / descriptions
};

module.exports = { clampText, LIMITS };
