// Run: node tests/anon-security.test.js        (needs internet; set SKIP_NETWORK_TESTS=1 to skip)
// Calls the LIVE Supabase API with the public (anon) key exactly as any visitor could, and checks that
// reads of public data work while every write / private read is refused.
// Safety: every write body is invalid on purpose (violates a NOT NULL / CHECK / type), or targets a row that does not
// exist, so even if a policy were wrongly open this test would not create or change any data.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

if (process.env.SKIP_NETWORK_TESTS) { console.log("SKIPPED — SKIP_NETWORK_TESTS is set"); process.exit(0); }

const cfg = fs.readFileSync(path.join(__dirname, "../js/config.js"), "utf8");
const URL_ = /url:\s*"([^"]+)"/.exec(cfg)[1], KEY = /key:\s*"([^"]+)"/.exec(cfg)[1];
const NOROW = "00000000-0000-0000-0000-000000000000";

async function call(method, p, body) {
  const res = await fetch(URL_ + p, {
    method, headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return res.status;
}

(async () => {
  const failures = [];
  const expect = (label, got, ok) => { const pass = ok.includes(got); console.log(`${pass ? "ok  " : "FAIL"} ${label} -> ${got}`); if (!pass) failures.push(`${label}: got ${got}, expected ${ok.join("/")}`); };
  const DENY = [401, 403];

  // public reads must work
  expect("anon read competitions", await call("GET", "/rest/v1/competitions?select=id&limit=1"), [200]);
  expect("anon read athletes", await call("GET", "/rest/v1/athletes?select=id&limit=1"), [200]);

  // private reads must be refused
  expect("anon read staff", await call("GET", "/rest/v1/staff?select=*"), DENY);
  expect("anon read athlete_log", await call("GET", "/rest/v1/athlete_log?select=*"), DENY);

  // writes must be refused (bodies are invalid on purpose, see the header)
  expect("anon insert athletes", await call("POST", "/rest/v1/athletes", {}), DENY);
  expect("anon insert competitions", await call("POST", "/rest/v1/competitions", { team_size: 99 }), DENY);
  expect("anon insert staff", await call("POST", "/rest/v1/staff", { user_id: "not-a-uuid" }), DENY);
  expect("anon insert athlete_log", await call("POST", "/rest/v1/athlete_log", {}), DENY);
  expect("anon update athletes", await call("PATCH", `/rest/v1/athletes?id=eq.${NOROW}`, { name: "x" }), DENY);
  expect("anon update competitions", await call("PATCH", `/rest/v1/competitions?id=eq.${NOROW}`, { name: "x" }), DENY);
  expect("anon delete athletes", await call("DELETE", `/rest/v1/athletes?id=eq.${NOROW}`), DENY);
  expect("anon delete competitions", await call("DELETE", `/rest/v1/competitions?id=eq.${NOROW}`), DENY);
  expect("anon rpc patch_athlete", await call("POST", "/rest/v1/rpc/patch_athlete", { aid: NOROW }), DENY);

  // public sign-up must be switched off
  const settings = await (await fetch(URL_ + "/auth/v1/settings", { headers: { apikey: KEY } })).json();
  const signupOff = settings.disable_signup === true;
  console.log(`${signupOff ? "ok  " : "FAIL"} auth sign-ups disabled -> ${settings.disable_signup}`);
  if (!signupOff) failures.push("auth sign-ups are enabled");

  assert.strictEqual(failures.length, 0, "\n" + failures.join("\n"));
  console.log("OK — anonymous visitors can read results and nothing else");
})().catch((e) => { console.error(e.message || e); process.exit(1); });
