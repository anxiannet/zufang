export type ExtractedLocationPlace = {
  place_type: string;
  name: string;
  distance_meters: number;
  walking_minutes: number;
  display_note?: string;
};

export function extractLocationMentions(value: string | null | undefined): {
  description_clean: string | null;
  places: ExtractedLocationPlace[];
} {
  const lines = normalizeMultiline(stripHtml(value ?? ""))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const places: ExtractedLocationPlace[] = [];
  const kept_lines: string[] = [];

  for (const line of lines) {
    if (/^📍?\s*位置$/.test(line)) continue;

    const extracted = extractPlacesFromLine(line);
    places.push(...extracted.places);

    if (extracted.keep_text) {
      kept_lines.push(extracted.keep_text);
    }
  }

  return {
    description_clean: kept_lines.join("\n").trim() || null,
    places: dedupePlaces(places)
  };
}

function extractPlacesFromLine(line: string): { places: ExtractedLocationPlace[]; keep_text: string | null } {
  const places: ExtractedLocationPlace[] = [];
  let keep_text = line;

  if (/NUS\s+Central\s+Library/i.test(line)) {
    const minutes = extractWalkingMinutes(line) ?? 15;
    places.push(place("school", "NUS Central Library", minutes * 80, minutes, `步行约 ${minutes} 分钟`));
    keep_text = removePlacePhrase(keep_text, /步行\s*\d+\s*分钟就?能?到\s*NUS\s+Central\s+Library[，,]?\s*/i);
    keep_text = normalizeSubjectiveText(keep_text);
  }

  if (/Kent\s+Ridge\s+Bus\s+Terminal/i.test(line)) {
    const minutes = extractWalkingMinutes(line) ?? 10;
    places.push(place("bus_terminal", "Kent Ridge Bus Terminal", minutes * 80, minutes, `步行约 ${minutes} 分钟`));
    keep_text = removePlacePhrase(keep_text, /\s*(?:和|、)?\s*Kent\s+Ridge\s+Bus\s+Terminal/i);
    keep_text = normalizeSubjectiveText(keep_text);
  }

  if (/西海岸公园|West\s+Coast\s+Park/i.test(line)) {
    const minutes = extractWalkingMinutes(line) ?? 10;
    places.push(place("park", "West Coast Park", minutes * 80, minutes, `步行约 ${minutes} 分钟内`));
    keep_text = removeListItem(keep_text, /西海岸公园|West\s+Coast\s+Park/i);
  }

  if (/West\s+Coast\s+plaza/i.test(line)) {
    const minutes = extractWalkingMinutes(line) ?? 10;
    places.push(place("mall", "West Coast Plaza", minutes * 80, minutes, `步行约 ${minutes} 分钟内`));
    keep_text = removeListItem(keep_text, /West\s+Coast\s+plaza/i);
  }

  if (/小区门口就是公交站牌|公交站牌|巴士站/i.test(line)) {
    places.push(place("bus_stop", "小区门口公交站", 30, 1, "小区门口"));
    keep_text = keep_text
      .replace(/小区门口就是公交站牌[，,]?\s*/g, "")
      .replace(/(?:公交|巴士)?路线?\s*/g, "");
    keep_text = normalizeSubjectiveText(keep_text);
  }

  if (/Vivo\s*City|VivoCity/i.test(line)) {
    places.push(place("mall", "VivoCity", 0, 0, "公交约 30 分钟"));
    keep_text = keep_text
      .replace(/[，,]?\s*143\/51\/30 等[，,]?\s*30 分钟直达 Vivo\s*City/i, "")
      .replace(/[，,]?\s*30 分钟直达 Vivo\s*City/i, "");
    keep_text = normalizeSubjectiveText(keep_text);
  }

  keep_text = keep_text
    .replace(/步行\s*\d+\s*分钟以内\s*[、，,等\s]*/g, "")
    .replace(/\s*([，,、；;。])\s*/g, "$1")
    .replace(/^[，,、；;。.\s]+|[，,、；;。.\s]+$/g, "")
    .trim();

  return { places, keep_text: keep_text || null };
}

function place(place_type: string, name: string, distance_meters: number, walking_minutes: number, display_note: string): ExtractedLocationPlace {
  return { place_type, name, distance_meters, walking_minutes, display_note };
}

function extractWalkingMinutes(line: string) {
  const match = line.match(/步行\s*(\d+)\s*分钟/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function removePlacePhrase(value: string, pattern: RegExp) {
  return value.replace(pattern, "");
}

function removeListItem(value: string, pattern: RegExp) {
  return value
    .replace(pattern, "")
    .replace(/、{2,}/g, "、")
    .replace(/、(?=[，,。；;])/g, "")
    .replace(/([，,；;])、/g, "$1");
}

function normalizeSubjectiveText(value: string) {
  return value
    .replace(/^，|^,/, "")
    .replace(/143\/51\/30 等[，,]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupePlaces(places: ExtractedLocationPlace[]) {
  const seen = new Set<string>();
  const result: ExtractedLocationPlace[] = [];
  for (const place of places) {
    const key = `${place.place_type}:${place.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(place);
  }
  return result;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function normalizeMultiline(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+|[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
