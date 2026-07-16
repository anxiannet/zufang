import { facilities, type FacilityAvailability } from "./types";

export type ParsedListingFacility = {
  facility_name: (typeof facilities)[number];
  availability: FacilityAvailability;
  note: string | null;
};

const facility_patterns: Array<{
  facility_name: ParsedListingFacility["facility_name"];
  pattern: RegExp;
}> = [
  { facility_name: "tv", pattern: /电视|TV/i },
  { facility_name: "washing_machine", pattern: /洗衣机|washer|washing\s*machine/i },
  { facility_name: "dryer", pattern: /烘干机|干衣机|dryer/i },
  { facility_name: "microwave", pattern: /微波炉|microwave/i },
  { facility_name: "fridge", pattern: /冰箱|fridge|refrigerator/i },
  { facility_name: "kitchen", pattern: /厨房|灶台|炉灶|明火|煮饭|cooking|kitchen/i }
];

const extracted_facility_line_patterns = [
  /[^\n。；;]*?(?:电视|TV)[^\n。；;]*?(?:洗衣机|washer|washing\s*machine)[^\n。；;]*?(?:烘干机|干衣机|dryer)[^\n。；;]*?(?:微波炉|microwave)[^\n。；;]*?(?:冰箱|fridge|refrigerator)[^\n。；;]*?(?:一应俱全|齐全|都有|配齐)?[。；;]?/gi,
  /[^\n。；;]*?(?:厨房)[^\n。；;]*?(?:公共区域|公用|共用)[^\n。；;]*?[。；;]?/gi,
  /[^\n。；;]*?(?:灶台|炉灶)[^\n。；;]*?(?:明火)[^\n。；;]*?[。；;]?/gi
];

export function extractListingFacilities(value: string | null | undefined): ParsedListingFacility[] {
  const text = value ?? "";
  const rows = new Map<ParsedListingFacility["facility_name"], ParsedListingFacility>();

  for (const item of facility_patterns) {
    if (!item.pattern.test(text)) continue;
    rows.set(item.facility_name, {
      facility_name: item.facility_name,
      availability: "available",
      note: null
    });
  }

  const kitchen = rows.get("kitchen");
  if (kitchen) {
    kitchen.note = buildKitchenNote(text);
  }

  return [...rows.values()].sort(
    (left, right) => facilities.indexOf(left.facility_name) - facilities.indexOf(right.facility_name)
  );
}

export function removeExtractedFacilityText(value: string | null | undefined): string | null {
  const text = value ?? "";
  if (!text.trim()) return null;

  let cleaned = text;
  for (const pattern of extracted_facility_line_patterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  cleaned = cleaned
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || null;
}

function buildKitchenNote(text: string): string | null {
  const notes: string[] = [];
  if (/厨房.{0,8}(公共区域|公用|共用)|(公共区域|公用|共用).{0,8}厨房/.test(text)) {
    notes.push("公共区域");
  }
  if (/(灶台|炉灶).{0,8}明火|明火.{0,8}(灶台|炉灶)/.test(text)) {
    notes.push("灶台为明火");
  }
  return notes.length > 0 ? notes.join("；") : null;
}
