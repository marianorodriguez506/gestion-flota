const EQUIPMENT_PREFIXES = [
  "CCH",
  "MN",
  "TO",
  "TP",
  "CF",
  "PR",
  "RE",
  "CT",
  "CV",
  "CR",
  "CA",
  "RN",
  "RV",
  "SB",
  "ST",
  "CC",
  "CP",
  "GE",
  "CM",
  "CB",
  "PL",
];

export function normalizeEquipment(value) {
  const text = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^T0/, "TO")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");

  const match = text.match(/^([A-Z]+)-?(\d{1,3})$/);

  if (!match) return text;

  const prefix = match[1];
  const number = match[2];

  if (!EQUIPMENT_PREFIXES.includes(prefix)) {
    return text;
  }

  return `${prefix}-${number}`;
}

function detectEquipment(text) {
  const prefixes = EQUIPMENT_PREFIXES.join("|");

  const match = text.match(
    new RegExp(`\\b(${prefixes}|T0)[\\s_-]*\\d{1,3}\\b`, "i")
  );

  return match ? normalizeEquipment(match[0]) : "";
}

function detectLocation(text) {
  const match = text.match(/ubicaci[oó]n\s*:?\s*([^\n\r]+)/i);

  return match
    ? match[1].trim().replace(/[.,]+$/, "")
    : "";
}

function detectFailure(text) {
  const match = text.match(
    /(?:falla(?:\s+detectada)?|desv[ií]o)\s*:?\s*([\s\S]*?)(?=\n\s*(?:estado|obs\.?|observaci[oó]n|adjuntar)\s*:|$)/i
  );

  if (!match) return "";

  return match[1]
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" - ");
}

function detectStatus(text) {
  const upper = text.toUpperCase();

  if (
    upper.includes("FUERA DE SERVICIO") ||
    upper.includes("PARADO") ||
    /\bFS\b/.test(upper)
  ) {
    return "FS";
  }

  if (
    upper.includes("OPERATIVO CON OBS") ||
    upper.includes("OPERATIVA CON OBS") ||
    upper.includes("CON OBSERVACIONES") ||
    upper.includes("CON OBSERVACION") ||
    upper.includes("CON PRECAUCIONES") ||
    upper.includes("ANDANDO CON OBSERVACIONES") ||
    upper.includes("OPERATIVO") ||
    upper.includes("OPERATIVA") ||
    /\bOBS\b/.test(upper)
  ) {
    return "OBS";
  }

  return "";
}

function detectHourmeter(text) {
  const match = text.match(
    /(?:hor[oó]metro(?:\s+actual)?|horometro)\s*:?\s*([^\n\r]+)/i
  );

  if (!match) return "";

  const number = match[1].match(/\d+(?:[.,]\d+)?/);

  return number ? number[0].replace(",", ".") : "";
}

export function processSingleReport(text) {
  const report = {
    originalText: text.trim(),
    equipment: detectEquipment(text),
    location: detectLocation(text),
    deviation: detectFailure(text),
    status: detectStatus(text),
    hourmeter: detectHourmeter(text),
  };

  const missing = [];

  if (!report.equipment) missing.push("interno");
  if (!report.location) missing.push("ubicación");
  if (!report.deviation) missing.push("falla");
  if (!report.status) missing.push("estado");

  return {
    report,
    missing,
    isComplete: missing.length === 0,
  };
}

export function splitReports(text) {
  return String(text || "")
    .split(/(?=REPORTE\s+INMEDIATO)/i)
    .map((part) => part.trim())
    .filter((part) => /REPORTE\s+INMEDIATO/i.test(part));
}

export function processReports(text) {
  const parts = splitReports(text);
  const completed = [];
  const pending = [];

  parts.forEach((part) => {
    const result = processSingleReport(part);

    if (result.isComplete) {
      completed.push(result.report);
    } else {
      pending.push(result);
    }
  });

  return {
    completed,
    pending,
  };
}