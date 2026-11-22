/** Locale-aware event date, time, venue and address. Browser-safe (no Node APIs). */

const LOCALES = {
  fr: "fr-BE",
  en: "en-GB",
  nl: "nl-BE",
  de: "de",
  es: "es",
  it: "it",
  pt: "pt",
  ar: "ar",
  ja: "ja",
  ko: "ko",
  zh: "zh-Hans",
};

const AND = {
  fr: "et",
  en: "and",
  nl: "en",
  de: "und",
  es: "y",
  it: "e",
  pt: "e",
  ar: "و",
  ja: "および",
  ko: "그리고",
  zh: "及",
};

const TIME_TO = {
  fr: "à",
  en: "to",
  nl: "tot",
  de: "bis",
  es: "a",
  it: "alle",
  pt: "às",
  ar: "إلى",
  ja: "～",
  ko: "~",
  zh: "至",
};

const CJK = new Set(["ja", "ko", "zh"]);
const RTL = new Set(["ar"]);

function localeFor(lang) {
  return LOCALES[lang] || lang || "fr";
}

function parseIso(iso) {
  const raw = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateParts(iso, lang = "fr") {
  const d = parseIso(iso);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat(localeFor(lang), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  }).formatToParts(d);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : "";
  };
  return { iso: String(iso).trim(), day: get("day"), month: get("month"), year: get("year") };
}

function joinDayMonthYear(p, lang) {
  if (!p) return "";
  if (lang === "es" || lang === "pt") return `${p.day} de ${p.month} de ${p.year}`;
  if (CJK.has(lang) || RTL.has(lang)) {
    return new Intl.DateTimeFormat(localeFor(lang), {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Brussels",
    }).format(parseIso(p.iso));
  }
  return `${p.day} ${p.month} ${p.year}`;
}

export function formatDayMonthYear(iso, lang = "fr") {
  return joinDayMonthYear(dateParts(iso, lang), lang);
}

function formatRange(start, end, lang = "fr") {
  const a = dateParts(start, lang);
  const b = dateParts(end || start, lang);
  if (!a) return "";
  if (!b || a.iso === b.iso) return joinDayMonthYear(a, lang);

  if (CJK.has(lang)) {
    if (a.year === b.year && a.month === b.month) {
      if (lang === "ja") return `${a.year}年${a.month}${a.day}日 - ${b.day}日`.replace("年年", "年");
      if (lang === "ko") return `${a.year}년 ${a.month} ${a.day}일 - ${b.day}일`;
      return `${a.year}年${a.month}${a.day}日 - ${b.day}日`;
    }
    return `${joinDayMonthYear(a, lang)} - ${joinDayMonthYear(b, lang)}`;
  }

  if (RTL.has(lang)) {
    return `${joinDayMonthYear(a, lang)} - ${joinDayMonthYear(b, lang)}`;
  }

  if (a.year === b.year && a.month === b.month) {
    if (lang === "es" || lang === "pt") return `${a.day} - ${b.day} de ${a.month} de ${a.year}`;
    return `${a.day} - ${b.day} ${a.month} ${a.year}`;
  }
  if (a.year === b.year) {
    if (lang === "es" || lang === "pt") return `${a.day} de ${a.month} - ${b.day} de ${b.month} de ${a.year}`;
    return `${a.day} ${a.month} - ${b.day} ${b.month} ${a.year}`;
  }
  return `${joinDayMonthYear(a, lang)} - ${joinDayMonthYear(b, lang)}`;
}

function parseHm(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatTime(value, lang = "fr") {
  const t = parseHm(value);
  if (!t) return "";
  const { hours, minutes } = t;
  if (lang === "en") {
    const ampm = hours >= 12 ? "pm" : "am";
    let hr = hours % 12;
    if (!hr) hr = 12;
    return minutes ? `${hr}:${String(minutes).padStart(2, "0")} ${ampm}` : `${hr} ${ampm}`;
  }
  if (lang === "de") return minutes ? `${hours}:${String(minutes).padStart(2, "0")} Uhr` : `${hours} Uhr`;
  if (lang === "nl") return minutes ? `${hours}.${String(minutes).padStart(2, "0")} uur` : `${hours} uur`;
  if (lang === "ja") return minutes ? `${hours}時${minutes}分` : `${hours}時`;
  if (lang === "ko") return minutes ? `${hours}시 ${minutes}분` : `${hours}시`;
  if (lang === "zh") return minutes ? `${hours}时${minutes}分` : `${hours}时`;
  if (lang === "ar") return minutes ? `${hours}:${String(minutes).padStart(2, "0")}` : `${hours}:00`;
  // fr, es, it, pt: typographic "17 h" / "20 h 30"
  return minutes ? `${hours} h ${minutes}` : `${hours} h`;
}

export function formatTimeRange(start, end, lang = "fr") {
  const a = formatTime(start, lang);
  if (!a) return "";
  const b = formatTime(end, lang);
  if (!b || start === end) return a;
  const sep = TIME_TO[lang] || "–";
  if (lang === "ja" || lang === "zh") return `${a}${sep}${b}`;
  return `${a} ${sep} ${b}`;
}

export function eventRanges(ev) {
  if (!ev) return [];
  const from = (list) => (list || [])
    .map((r) => {
      const start = r && (r.start || r.date);
      if (!start) return null;
      const end = r.end || r.dateEnd || start;
      const out = { start };
      if (end && end !== start) out.end = end;
      if (r.time) out.time = String(r.time).slice(0, 5);
      if (r.timeEnd) out.timeEnd = String(r.timeEnd).slice(0, 5);
      return out;
    })
    .filter(Boolean);
  if (Array.isArray(ev.ranges) && ev.ranges.length) return from(ev.ranges);
  if (Array.isArray(ev.periods) && ev.periods.length) {
    const ranges = from(ev.periods);
    if (ranges.length === 1) {
      if (ev.time) ranges[0].time = String(ev.time).slice(0, 5);
      if (ev.timeEnd) ranges[0].timeEnd = String(ev.timeEnd).slice(0, 5);
    }
    return ranges;
  }
  if (!ev.date) return [];
  const one = { start: ev.date };
  if (ev.dateEnd && ev.dateEnd !== ev.date) one.end = ev.dateEnd;
  if (ev.time) one.time = String(ev.time).slice(0, 5);
  if (ev.timeEnd) one.timeEnd = String(ev.timeEnd).slice(0, 5);
  return [one];
}

export function rangeSpan(ranges) {
  const list = (ranges || []).filter((r) => r && r.start);
  if (!list.length) return { date: "", dateEnd: "" };
  const starts = list.map((r) => r.start).sort();
  const ends = list.map((r) => r.end || r.start).sort();
  return { date: starts[0], dateEnd: ends[ends.length - 1] };
}

export function syncRangeSpan(ev) {
  if (!ev) return ev;
  const span = rangeSpan(eventRanges(ev));
  if (span.date) {
    ev.date = span.date;
    ev.dateEnd = span.dateEnd;
  }
  return ev;
}

export function formatRangeLine(range, lang = "fr") {
  if (!range || !range.start) return "";
  const datePart = formatRange(range.start, range.end || range.start, lang);
  if (!datePart) return "";
  const timePart = formatTimeRange(range.time, range.timeEnd, lang);
  return timePart ? `${datePart} - ${timePart}` : datePart;
}

export function formatEventWhenLines(ev, lang = "fr") {
  return eventRanges(ev).map((r) => formatRangeLine(r, lang)).filter(Boolean);
}

export function formatEventWhen(ev, lang = "fr", sep = " · ") {
  return formatEventWhenLines(ev, lang).join(sep);
}

/** Date-only lines for the hero: no times. Each range keeps start/end so the client can pick current or next. */
export function eventDateLines(ev, lang = "fr") {
  return eventRanges(ev)
    .map((r) => {
      const start = r.start;
      const end = r.end || r.start;
      const text = formatRange(start, end, lang);
      return text ? { start, end, text } : null;
    })
    .filter(Boolean);
}

export function pickDateLine(lines, today = "") {
  const list = (lines || []).filter((l) => l && l.text);
  if (!list.length) return "";
  if (!today) return list[0].text;
  const current = list.find((l) => l.start <= today && today <= (l.end || l.start));
  if (current) return current.text;
  const upcoming = list.filter((l) => l.start > today).sort((a, b) => a.start.localeCompare(b.start));
  if (upcoming.length) return upcoming[0].text;
  return list[list.length - 1].text;
}

export function fieldLang(field, lang = "fr") {
  if (field == null || field === "") return "";
  if (typeof field === "string") return field.trim();
  const raw = field[lang] || field.fr || field.en || "";
  return String(raw || "").trim();
}

export function periodsToText(periods) {
  if (!Array.isArray(periods) || !periods.length) return "";
  return periods
    .map((p) => {
      const a = p.start || "";
      const b = p.end || p.start || "";
      return a && b && a !== b ? `${a} / ${b}` : a;
    })
    .filter(Boolean)
    .join("\n");
}

export function textToPeriods(text) {
  const lines = String(text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})(?:\s*[–/]\s*(\d{4}-\d{2}-\d{2}))?$/);
    if (!m) continue;
    out.push({ start: m[1], end: m[2] || m[1] });
  }
  return out;
}
