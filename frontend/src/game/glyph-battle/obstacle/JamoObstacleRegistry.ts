import type { JamoObstacleTemplate } from "./JamoObstacleTemplate";
import {
  A_TEMPLATE, EO_TEMPLATE, EU_TEMPLATE, GIYEOK_TEMPLATE, IEUNG_TEMPLATE, I_TEMPLATE,
  JIEUT_TEMPLATE, MIEUM_TEMPLATE, NIEUN_TEMPLATE, O_TEMPLATE, SIOT_TEMPLATE, U_TEMPLATE,
  EXPANDED_JAMO_OBSTACLE_TEMPLATES,
} from "./templates";
import { COMPETITIVE_RECOGNITION_SYMBOLS } from "../../recognition/readiness/recognitionReadiness";

export class UnsupportedJamoSymbolError extends Error {
  constructor(readonly symbol: string) {
    super(`Unsupported line-race obstacle symbol: ${symbol}`);
    this.name = "UnsupportedJamoSymbolError";
  }
}

export class JamoObstacleRegistry {
  private readonly byId = new Map<string, JamoObstacleTemplate>();
  private readonly bySymbol = new Map<string, JamoObstacleTemplate>();

  constructor(templates: readonly JamoObstacleTemplate[] = []) {
    for (const template of templates) this.register(template);
  }

  register(template: JamoObstacleTemplate): void {
    if (this.byId.has(template.templateId)) throw new Error(`Duplicate obstacle templateId: ${template.templateId}`);
    if (this.bySymbol.has(template.symbol)) throw new Error(`Duplicate obstacle symbol: ${template.symbol}`);
    this.byId.set(template.templateId, template);
    this.bySymbol.set(template.symbol, template);
  }

  getById(templateId: string): JamoObstacleTemplate | undefined { return this.byId.get(templateId); }
  getBySymbol(symbol: string): JamoObstacleTemplate | undefined { return this.bySymbol.get(symbol); }
  requireSymbol(symbol: string): JamoObstacleTemplate {
    const template = this.getBySymbol(symbol);
    if (!template) throw new UnsupportedJamoSymbolError(symbol);
    return template;
  }
  getAll(): readonly JamoObstacleTemplate[] { return [...this.byId.values()]; }
  getSupportedSymbols(): readonly string[] { return [...this.bySymbol.keys()]; }
}

export const DEFAULT_JAMO_OBSTACLE_TEMPLATES = [
  GIYEOK_TEMPLATE, NIEUN_TEMPLATE, MIEUM_TEMPLATE, IEUNG_TEMPLATE, SIOT_TEMPLATE, JIEUT_TEMPLATE,
  A_TEMPLATE, EO_TEMPLATE, O_TEMPLATE, U_TEMPLATE, EU_TEMPLATE, I_TEMPLATE,
  ...EXPANDED_JAMO_OBSTACLE_TEMPLATES,
] as const;

export function createDefaultJamoObstacleRegistry(): JamoObstacleRegistry {
  return new JamoObstacleRegistry(DEFAULT_JAMO_OBSTACLE_TEMPLATES);
}

export function createCompetitiveJamoObstacleRegistry(): JamoObstacleRegistry {
  const allowed = new Set(COMPETITIVE_RECOGNITION_SYMBOLS);
  return new JamoObstacleRegistry(DEFAULT_JAMO_OBSTACLE_TEMPLATES.filter((template) => allowed.has(template.symbol)));
}
