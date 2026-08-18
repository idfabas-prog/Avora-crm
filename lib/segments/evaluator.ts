import { segmentFieldMap, segmentOperators } from "./fields.ts";
import type { SegmentCondition, SegmentContactProfile, SegmentRuleGroup } from "./types";

type SegmentEvaluation = { matched: boolean; reasons: string[] };

export function validateSegmentRules(group: SegmentRuleGroup): boolean {
  if (!["and", "or"].includes(group.logic)) return false;
  return group.conditions.every((condition) => {
    if (isGroup(condition)) return validateSegmentRules(condition);
    return segmentFieldMap.has(condition.field) && segmentOperators.includes(condition.operator);
  });
}

export function evaluateSegment(group: SegmentRuleGroup, profile: SegmentContactProfile, now = new Date()): SegmentEvaluation {
  if (!validateSegmentRules(group)) {
    return { matched: false, reasons: ["Segment rule contains unsupported fields or operators"] };
  }
  const results: SegmentEvaluation[] = group.conditions.map((condition) => isGroup(condition) ? evaluateSegment(condition, profile, now) : evaluateCondition(condition, profile, now));
  const matched = group.logic === "and" ? results.every((result: SegmentEvaluation) => result.matched) : results.some((result: SegmentEvaluation) => result.matched);
  return {
    matched,
    reasons: results.filter((result: SegmentEvaluation) => result.matched).flatMap((result: SegmentEvaluation) => result.reasons)
  };
}

export function evaluateCondition(condition: SegmentCondition, profile: SegmentContactProfile, now = new Date()): SegmentEvaluation {
  const field = segmentFieldMap.get(condition.field);
  if (!field) return { matched: false, reasons: [`Unsupported field ${condition.field}`] };
  const actual = field.read(profile);
  const expected = condition.value;
  const matched = compare(actual, condition.operator, expected, now);
  return {
    matched,
    reasons: matched ? [`${field.label} ${condition.operator.replaceAll("_", " ")} ${formatValue(expected)}`] : []
  };
}

function isGroup(value: SegmentCondition | SegmentRuleGroup): value is SegmentRuleGroup {
  return "logic" in value && Array.isArray(value.conditions);
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  const parsed = new Date(String(value ?? "")).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function compare(actual: unknown, operator: SegmentCondition["operator"], expected: unknown, now: Date): boolean {
  if (operator === "is_empty") return isEmpty(actual);
  if (operator === "is_not_empty") return !isEmpty(actual);
  if (operator === "equals") return normalize(actual) === normalize(expected);
  if (operator === "not_equals") return normalize(actual) !== normalize(expected);
  if (operator === "contains") {
    if (Array.isArray(actual)) return actual.map(normalize).includes(normalize(expected));
    return normalize(actual).includes(normalize(expected));
  }
  if (operator === "does_not_contain") {
    if (Array.isArray(actual)) return !actual.map(normalize).includes(normalize(expected));
    return !normalize(actual).includes(normalize(expected));
  }
  if (operator === "greater_than") return number(actual) > number(expected);
  if (operator === "less_than") return number(actual) < number(expected);
  if (operator === "greater_than_or_equal") return number(actual) >= number(expected);
  if (operator === "less_than_or_equal") return number(actual) <= number(expected);
  if (operator === "before") {
    const actualDate = dateValue(actual);
    const expectedDate = dateValue(expected);
    return actualDate !== null && expectedDate !== null && actualDate < expectedDate;
  }
  if (operator === "after") {
    const actualDate = dateValue(actual);
    const expectedDate = dateValue(expected);
    return actualDate !== null && expectedDate !== null && actualDate > expectedDate;
  }
  if (operator === "between") {
    const [start, end] = Array.isArray(expected) ? expected : [];
    return number(actual) >= number(start) && number(actual) <= number(end);
  }
  if (operator === "in") {
    const values = Array.isArray(expected) ? expected.map(normalize) : [normalize(expected)];
    return values.includes(normalize(actual));
  }
  if (operator === "not_in") {
    const values = Array.isArray(expected) ? expected.map(normalize) : [normalize(expected)];
    return !values.includes(normalize(actual));
  }
  if (operator === "within_last_days") {
    const actualDate = dateValue(actual);
    if (actualDate === null) return false;
    const days = Math.floor((now.getTime() - actualDate) / 86400000);
    return days >= 0 && days <= number(expected);
  }
  if (operator === "more_than_days_ago") {
    const actualDate = dateValue(actual);
    if (actualDate === null) return false;
    return Math.floor((now.getTime() - actualDate) / 86400000) > number(expected);
  }
  return false;
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === undefined) return "";
  return String(value);
}
