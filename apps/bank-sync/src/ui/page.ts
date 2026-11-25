/**
 * The single local page (Hebrew, RTL, plain CSS + vanilla JS, no build step). Served with a
 * per-request CSP nonce. Data is rendered with textContent only. Credential inputs are
 * write-only: the page never receives saved values back, only "saved / not saved".
 * Colors copy the Hearth tokens (apps/web/src/index.css) and follow the OS dark mode.
 */

const STYLE = `
:root {
  --background: oklch(96% 0.02 80); --foreground: oklch(27% 0.03 50); --card: oklch(99% 0.008 80);
  --primary: oklch(62% 0.16 38); --primary-foreground: oklch(100% 0 0); --muted-foreground: oklch(52% 0.02 55);
  --border: oklch(89% 0.02 70); --positive: oklch(56% 0.09 155); --negative: oklch(58% 0.18 25);
  --warning: oklch(80% 0.12 82); --radius: 10px;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(18% 0.015 60); --foreground: oklch(95% 0.01 80); --card: oklch(23% 0.015 60);
    --primary: oklch(68% 0.15 40); --primary-foreground: oklch(16% 0.02 50); --muted-foreground: oklch(70% 0.015 65);
    --border: oklch(32% 0.015 60); --positive: oklch(65% 0.1 155); --negative: oklch(65% 0.17 27);
    --warning: oklch(78% 0.12 82);
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--background); color: var(--foreground);
  font-family: system-ui, "Segoe UI", Arial, sans-serif; line-height: 1.5; }
main { max-width: 760px; margin-inline: auto; padding: 24px 16px 48px; }
h1 { font-size: 1.5rem; margin-block: 0 4px; }
h2 { font-size: 1.1rem; margin-block: 0 12px; }
p.lead, .muted { color: var(--muted-foreground); }
section { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px; margin-block-start: 16px; }
label { display: block; font-size: 0.9rem; margin-block-start: 8px; }
input { display: block; width: 100%; padding: 8px 10px; margin-block-start: 4px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--background); color: var(--foreground); font: inherit; }
button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--card); color: var(--foreground); cursor: pointer; margin-block-start: 12px; margin-inline-end: 8px; }
button.primary { background: var(--primary); color: var(--primary-foreground); border-color: transparent; }
button:disabled { opacity: 0.6; cursor: default; }
.row { display: flex; flex-wrap: wrap; gap: 12px; }
.row > div { flex: 1 1 200px; }
.picks { margin-block-end: 12px; }
.pick { display: inline-flex; align-items: center; gap: 6px; margin-block-start: 0; cursor: pointer; }
.provider { border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-block-start: 12px; }
.chip { display: inline-block; font-size: 0.8rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border);
  margin-inline-start: 8px; }
.chip.ok { color: var(--positive); border-color: var(--positive); }
.chip.bad { color: var(--negative); border-color: var(--negative); }
.chip.warn { color: var(--foreground); background: color-mix(in oklch, var(--warning) 25%, transparent); border-color: var(--warning); }
.error { color: var(--negative); margin-block-start: 8px; }
.notice { color: var(--foreground); background: color-mix(in oklch, var(--warning) 20%, transparent);
  border: 1px solid var(--warning); border-radius: 8px; padding: 8px 10px; margin-block-start: 8px; }
ul.report { padding-inline-start: 20px; margin-block: 8px 0; }
details.skipped { margin-block-start: 6px; }
details.skipped summary { cursor: pointer; color: var(--muted-foreground, inherit); }
details.skipped table { border-collapse: collapse; margin-block-start: 6px; font-size: 0.9rem; }
details.skipped th, details.skipped td { text-align: start; padding: 3px 8px; border-block-end: 1px solid var(--border); }
.ltr { direction: ltr; unicode-bidi: isolate; }
`;

const SCRIPT = `
(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get("t") || "";
  history.replaceState(null, "", "/");
  var root = document.getElementById("app");
  var state = null;
  var busy = false;
  var messages = {};

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "class") node.className = attrs[k];
      else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) node.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, String(attrs[k]));
    });
    (children || []).forEach(function (ch) { if (ch) node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch); });
    return node;
  }

  function call(method, path, body) {
    var init = { method: method, headers: { "X-Local-Token": token } };
    if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
    }, function () { return { ok: false, data: { error: "האפליקציה המקומית אינה זמינה." } }; });
  }

  function refresh() {
    return call("GET", "/local/state").then(function (r) {
      if (!r.ok) { root.textContent = "אין גישה. פתחו את הכתובת שהודפסה בחלון הפקודה."; return; }
      state = r.data; render();
    });
  }

  function action(key, method, path, bodyFn, after) {
    return function (ev) {
      if (ev) ev.preventDefault();
      if (busy) return;
      // Read form values BEFORE render(): render() rebuilds the DOM and would wipe the inputs.
      var body = bodyFn ? bodyFn() : undefined;
      var form = ev && ev.target && ev.target.tagName === "FORM" ? ev.target : null;
      var ownIds = form ? Array.prototype.map.call(form.querySelectorAll("input[id]"), function (n) { return n.id; }) : [];
      busy = true; messages[key] = null; render();
      call(method, path, body).then(function (r) {
        busy = false;
        if (r.ok) ownIds.forEach(function (id) { delete drafts[id]; });
        messages[key] = r.ok ? (r.data && r.data.warning ? { warn: r.data.warning } : null) : { error: (r.data && r.data.error) || "שגיאה" };
        if (after) after(r);
        return refresh();
      });
    };
  }

  function val(id) { var n = document.getElementById(id); return n ? n.value : ""; }
  function msg(key) {
    var m = messages[key];
    if (!m) return null;
    return m.error ? el("div", { class: "error", role: "alert", text: m.error }) : el("div", { class: "notice", text: m.warn });
  }

  function vaultSection() {
    var s = el("section", null, [el("h2", { text: "כספת מקומית" })]);
    if (state.unlocked) {
      s.appendChild(el("p", { class: "muted", text: "הכספת פתוחה. פרטי הכניסה מוצפנים במחשב זה בלבד ואינם נשלחים לשרת." }));
      s.appendChild(el("button", { type: "button", onclick: action("vault", "POST", "/local/lock"), disabled: busy, text: "נעילת הכספת" }));
    } else {
      s.appendChild(el("p", { class: "muted", text: state.vaultExists
        ? "הזינו את סיסמת הכספת כדי לפתוח אותה."
        : "צרו סיסמת כספת (לפחות 8 תווים). הסיסמה אינה נשמרת ואין דרך לשחזר אותה." }));
      var form = el("form", { onsubmit: action("vault", "POST", "/local/vault", function () { return { passphrase: val("passphrase") }; }) }, [
        el("label", { for: "passphrase", text: "סיסמת הכספת" }),
        el("input", { id: "passphrase", type: "password", autocomplete: "off", required: true }),
        el("button", { class: "primary", type: "submit", disabled: busy, text: state.vaultExists ? "פתיחת הכספת" : "יצירת כספת" }),
      ]);
      s.appendChild(form);
    }
    var m = msg("vault"); if (m) s.appendChild(m);
    return s;
  }

  function serverSection() {
    var s = el("section", null, [el("h2", { text: "חיבור לשרת" })]);
    var se = state.session;
    if (se) {
      s.appendChild(el("p", null, [
        "מחובר/ת כ־", el("span", { class: "ltr", text: se.email }),
        se.householdName ? " · משק בית: " + se.householdName : "",
        se.role ? " · תפקיד: " + se.role : "",
      ]));
      s.appendChild(el("p", { class: "muted", text: "השרת: " }, [el("span", { class: "ltr", text: state.apiOrigin })]));
      s.appendChild(el("button", { type: "button", onclick: action("server", "POST", "/local/logout"), disabled: busy, text: "התנתקות" }));
    } else {
      var form = el("form", { onsubmit: action("server", "POST", "/local/login", function () {
        return { apiOrigin: val("apiOrigin"), email: val("email"), password: val("password") };
      }) }, [
        el("label", { for: "apiOrigin", text: "כתובת השרת (API)" }),
        el("input", { id: "apiOrigin", type: "url", dir: "ltr", value: state.apiOrigin, placeholder: "https://...", required: true }),
        el("div", { class: "row" }, [
          el("div", null, [el("label", { for: "email", text: "אימייל" }), el("input", { id: "email", type: "email", dir: "ltr", autocomplete: "username", required: true })]),
          el("div", null, [el("label", { for: "password", text: "סיסמה לאפליקציה" }), el("input", { id: "password", type: "password", autocomplete: "current-password", required: true })]),
        ]),
        el("button", { class: "primary", type: "submit", disabled: busy, text: "התחברות" }),
      ]);
      s.appendChild(form);
      s.appendChild(el("p", { class: "muted", text: "הסיסמה לאפליקציה אינה נשמרת; נשמר רק אסימון ההתחברות, בכספת המוצפנת." }));
    }
    var m = msg("server"); if (m) s.appendChild(m);
    return s;
  }

  function providersSection() {
    var s = el("section", null, [el("h2", { text: "פרטי כניסה לבנק ולכרטיסים" }),
      el("p", { class: "muted", text: "ספקים הדורשים קוד אימות (OTP) אינם נתמכים בגרסה זו." })]);
    state.providers.forEach(function (p) {
      var key = "prov-" + p.id;
      var inputs = p.fields.map(function (f) {
        var id = p.id + "-" + f.key;
        return el("div", null, [el("label", { for: id, text: f.label }),
          el("input", { id: id, type: f.key === "password" ? "password" : "text", autocomplete: "off", dir: "ltr", required: true })]);
      });
      var form = el("form", { class: "provider", onsubmit: action(key, "PUT", "/local/providers/" + p.id, function () {
        var body = {}; p.fields.forEach(function (f) { body[f.key] = val(p.id + "-" + f.key); }); return body;
      }) }, [
        el("strong", { text: p.label }),
        el("span", { class: "chip " + (p.saved ? "ok" : ""), text: p.saved ? "נשמר" : "לא נשמר" }),
        el("div", { class: "row" }, inputs),
        el("button", { class: "primary", type: "submit", disabled: busy, text: p.saved ? "עדכון" : "שמירה" }),
        p.saved ? el("button", { type: "button", disabled: busy, onclick: action(key, "DELETE", "/local/providers/" + p.id), text: "מחיקה" }) : null,
      ]);
      var m = msg(key); if (m) form.appendChild(m);
      s.appendChild(form);
    });
    return s;
  }

  function settingsSection() {
    var st = state.settings;
    var s = el("section", null, [el("h2", { text: "הגדרות" })]);
    s.appendChild(el("form", { onsubmit: action("settings", "PUT", "/local/settings", function () {
      return { lookbackDays: Number(val("lookbackDays")), overlapDays: Number(val("overlapDays")) };
    }) }, [
      el("div", { class: "row" }, [
        el("div", null, [el("label", { for: "lookbackDays", text: "ימים לסריקה בסנכרון ראשון" }),
          el("input", { id: "lookbackDays", type: "number", min: 1, max: 365, value: st.lookbackDays })]),
        el("div", null, [el("label", { for: "overlapDays", text: "ימי חפיפה בסנכרון הבא" }),
          el("input", { id: "overlapDays", type: "number", min: 0, max: 60, value: st.overlapDays })]),
      ]),
      el("p", { class: "muted", text: "אם ייבאתם בעבר קובצי CSV, הגדירו את הסריקה הראשונה כך שתתחיל אחרי הייבוא האחרון כדי למנוע כפילויות." }),
      el("button", { type: "submit", disabled: busy, text: "שמירת הגדרות" }),
    ]));
    var m = msg("settings"); if (m) s.appendChild(m);
    return s;
  }

  var SKIP_REASON = { pending: "ממתינה (טרם חויבה)", foreign: "מטבע חוץ", invalid: "סכום אפס או תאריך לא תקין" };
  function skippedList(rows) {
    var d = el("details", { class: "skipped" }, [el("summary", { text: "הצג " + rows.length + " תנועות שדולגו" })]);
    d.appendChild(el("table", null, [
      el("thead", null, [el("tr", null, [el("th", { text: "תאריך" }), el("th", { text: "תיאור" }), el("th", { text: "סכום" }), el("th", { text: "סיבה" })])]),
      el("tbody", null, rows.map(function (r) {
        return el("tr", null, [
          el("td", { class: "ltr", text: r.date }),
          el("td", { text: r.description || "ללא תיאור" }),
          el("td", { class: "ltr", text: r.amount + (r.currency && r.currency !== "ILS" ? " " + r.currency : "") }),
          el("td", { text: SKIP_REASON[r.reason] || r.reason }),
        ]);
      })),
    ]));
    return d;
  }

  function accountLine(a) {
    var statusText = a.status === "linked" ? "משויך" : a.status === "ignored" ? "מוסתר" : "לא משויך";
    var li = el("li", null, [
      el("span", { class: "ltr", text: "••••" + a.last4 }),
      el("span", { class: "chip " + (a.status === "linked" ? "ok" : a.status === "unmapped" ? "warn" : ""), text: statusText }),
      " נוספו " + a.created + ", כפולות " + a.duplicates + ", ממתינות שדולגו " + a.skippedPending +
        (a.skippedForeign ? ", מט״ח שדולגו " + a.skippedForeign : "") + (a.skippedInvalid ? ", לא תקינות " + a.skippedInvalid : ""),
    ]);
    if (a.skippedRows && a.skippedRows.length) li.appendChild(skippedList(a.skippedRows));
    if (a.error) li.appendChild(el("div", { class: "error", text: a.error }));
    if (a.hint) li.appendChild(el("div", { class: "muted", text: a.hint }));
    return li;
  }

  // Which saved providers the next sync runs. Survives re-renders; new providers start selected.
  var syncPick = {};
  function syncSection() {
    var s = el("section", null, [el("h2", { text: "סנכרון" })]);
    var saved = state.providers.filter(function (p) { return p.saved; });
    saved.forEach(function (p) { if (!(p.id in syncPick)) syncPick[p.id] = true; });
    var chosen = saved.filter(function (p) { return syncPick[p.id]; }).map(function (p) { return p.id; });
    if (saved.length) {
      s.appendChild(el("p", { class: "muted", text: "בחרו אילו ספקים לסנכרן:" }));
      s.appendChild(el("div", { class: "row picks" }, saved.map(function (p) {
        var box = el("input", { type: "checkbox", checked: !!syncPick[p.id], disabled: busy,
          onchange: function (ev) { syncPick[p.id] = ev.target.checked; render(); } });
        return el("label", { class: "pick" }, [box, " " + p.label]);
      })));
    }
    var canSync = state.unlocked && state.session && chosen.length > 0 && !state.running;
    s.appendChild(el("button", { class: "primary", type: "button", disabled: busy || !canSync,
      onclick: action("sync", "POST", "/local/sync", function () { return { providers: chosen }; }),
      text: busy ? "מעבד..." : chosen.length === saved.length ? "סנכרן עכשיו" : "סנכרן את הנבחרים" }));
    if (saved.length && !chosen.length) s.appendChild(el("p", { class: "muted", text: "יש לבחור לפחות ספק אחד." }));
    if (busy) s.appendChild(el("p", { class: "muted", text: "הפעולה מתבצעת. סנכרון יכול להימשך כמה דקות." }));
    var m = msg("sync"); if (m) s.appendChild(m);
    var rep = state.lastReport;
    if (rep) {
      s.appendChild(el("p", { class: "muted", text: "סנכרון אחרון: " + new Date(rep.finishedAt).toLocaleString("he-IL") }));
      if (rep.error) s.appendChild(el("div", { class: "error", text: rep.error }));
      rep.providers.forEach(function (p) {
        var block = el("div", { class: "provider" }, [el("strong", { text: p.label }),
          el("span", { class: "chip " + (p.ok ? "ok" : "bad"), text: p.ok ? "הצליח" : "נכשל" }),
          el("div", { class: "muted", text: "מתאריך " + p.startDate + (p.cursorAdvanced ? "" : " · הסנכרון הבא יסרוק שוב את אותו טווח") })]);
        if (p.error) block.appendChild(el("div", { class: "error", text: p.error }));
        if (p.droppedInvalid) block.appendChild(el("div", { class: "muted", text: p.droppedInvalid + " תנועות ללא תאריך או סכום תקין לא נשלחו" }));
        if (p.failedAccounts && p.failedAccounts.length) block.appendChild(el("div", { class: "error", text: "הספק סירב להחזיר תנועות לחשבונות המסתיימים ב-" + p.failedAccounts.join(", ") + " (ייתכן שהם סגורים, חשבונות חיסכון או ללא הרשאה). שאר החשבונות סונכרנו." }));
        if (p.accounts.length) block.appendChild(el("ul", { class: "report" }, p.accounts.map(accountLine)));
        else if (p.ok) block.appendChild(el("div", { class: "muted", text: "לא נמצאו חשבונות." }));
        s.appendChild(block);
      });
    }
    return s;
  }

  // Values typed into inputs survive re-renders; a form's own values are dropped once it submits successfully.
  var drafts = {};
  function render() {
    if (!state) return;
    root.querySelectorAll("input[id]").forEach(function (n) { drafts[n.id] = n.value; });
    root.textContent = "";
    root.appendChild(el("h1", { text: "סנכרון בנקים וכרטיסי אשראי" }));
    root.appendChild(el("p", { class: "lead", text: "האפליקציה פועלת במחשב שלכם בלבד. פרטי הכניסה לבנק נשמרים מוצפנים כאן ולא נשלחים לשרת; לשרת נשלחות רק התנועות." }));
    root.appendChild(vaultSection());
    if (state.unlocked) {
      root.appendChild(serverSection());
      root.appendChild(providersSection());
      root.appendChild(settingsSection());
      root.appendChild(syncSection());
    }
    root.querySelectorAll("input[id]").forEach(function (n) { if (n.id in drafts) n.value = drafts[n.id]; });
  }

  refresh();
})();
`;

export function renderPage(nonce: string): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>סנכרון בנקים</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main id="app" aria-live="polite">טוען...</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}
