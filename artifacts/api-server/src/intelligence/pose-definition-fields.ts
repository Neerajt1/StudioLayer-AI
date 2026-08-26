// ---------------------------------------------------------------------------
// Parse Pose Master structured definition fields (generation / audit only).
// Does not mutate Excel / catalog / PNGs.
// ---------------------------------------------------------------------------

export const POSE_DEFINITION_FIELD_KEYS = [
  "PROMPT-READY DEFINITION",
  "BODY STATE",
  "SUPPORT / SURFACE",
  "INTRINSIC OBJECT",
  "TORSO",
  "HEAD",
  "GAZE",
  "LEFT ARM",
  "RIGHT ARM",
  "LEFT LEG",
  "RIGHT LEG",
  "WEIGHT / SUPPORT",
  "CRITICAL POSE ANCHORS",
  "FLEXIBLE DETAILS",
  "FORBIDDEN VARIANTS",
  "MIRRORING RULE",
  "GARMENT INTERACTION",
  "CAMERA / FRAMING",
  "STUDIO DELIVERY",
] as const;

export type PoseDefinitionFieldKey = (typeof POSE_DEFINITION_FIELD_KEYS)[number];

const FIELD_HEADER_RE =
  /^(PROMPT-READY DEFINITION|BODY STATE|SUPPORT \/ SURFACE|INTRINSIC OBJECT(?: \(required for this pose only\))?|TORSO|HEAD|GAZE|LEFT ARM|RIGHT ARM|LEFT LEG|RIGHT LEG|WEIGHT \/ SUPPORT|CRITICAL POSE ANCHORS|FLEXIBLE DETAILS|FORBIDDEN VARIANTS|MIRRORING RULE|GARMENT INTERACTION|CAMERA \/ FRAMING|STUDIO DELIVERY):\s*(.*)$/i;

function normalizeFieldKey(raw: string): PoseDefinitionFieldKey | string {
  const upper = raw.toUpperCase().replace(/\s+/g, " ").trim();
  return upper.replace(/ \(REQUIRED FOR THIS POSE ONLY\)$/i, "") as PoseDefinitionFieldKey;
}

/** Parse a Pose Master structured definition into field → text map. */
export function parsePoseDefinitionFields(
  structuredDefinition: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (current) out[current] = buf.join("\n").trim();
  };

  for (const line of structuredDefinition.split("\n")) {
    const known = line.match(FIELD_HEADER_RE);
    if (known) {
      flush();
      current = normalizeFieldKey(known[1]!);
      buf = [known[2] ?? ""];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

/** Replace or insert the GARMENT INTERACTION block without touching other fields. */
export function replaceGarmentInteractionBlock(
  structuredDefinition: string,
  newBlock: string,
): string {
  const normalizedBlock = newBlock.trimEnd();
  if (/GARMENT INTERACTION:/i.test(structuredDefinition)) {
    return structuredDefinition.replace(
      /GARMENT INTERACTION:\s*[\s\S]*?(?=\n(?:CAMERA \/ FRAMING|STUDIO DELIVERY|[A-Z][A-Z0-9 /()—\-]+:)|$)/i,
      `${normalizedBlock}\n`,
    );
  }

  if (/CAMERA \/ FRAMING:/i.test(structuredDefinition)) {
    return structuredDefinition.replace(
      /CAMERA \/ FRAMING:/i,
      `${normalizedBlock}\nCAMERA / FRAMING:`,
    );
  }

  return `${structuredDefinition.trimEnd()}\n\n${normalizedBlock}`;
}
