import type { ConditionOperator, ExecutionContext, WorkflowCondition } from "./types.ts";

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : value;
}

function isEmpty(value: unknown) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function getConditionValue(context: ExecutionContext | Record<string, unknown>, field: string) {
  return getPath(context, field);
}

export function evaluateOperator(actual: unknown, operator: ConditionOperator, expected?: unknown) {
  const normalizedActual = normalize(actual);
  const normalizedExpected = normalize(expected);

  switch (operator) {
    case "equals":
      return normalizedActual === normalizedExpected;
    case "not_equals":
      return normalizedActual !== normalizedExpected;
    case "contains":
      return String(normalizedActual ?? "").includes(String(normalizedExpected ?? ""));
    case "does_not_contain":
      return !String(normalizedActual ?? "").includes(String(normalizedExpected ?? ""));
    case "greater_than":
      return Number(actual ?? 0) > Number(expected ?? 0);
    case "less_than":
      return Number(actual ?? 0) < Number(expected ?? 0);
    case "greater_than_or_equal":
      return Number(actual ?? 0) >= Number(expected ?? 0);
    case "less_than_or_equal":
      return Number(actual ?? 0) <= Number(expected ?? 0);
    case "is_empty":
      return isEmpty(actual);
    case "is_not_empty":
      return !isEmpty(actual);
    case "in":
      return Array.isArray(expected) && expected.map(normalize).includes(normalizedActual);
    case "not_in":
      return Array.isArray(expected) && !expected.map(normalize).includes(normalizedActual);
    default:
      return false;
  }
}

export function evaluateCondition(condition: WorkflowCondition, context: ExecutionContext | Record<string, unknown>) {
  return evaluateOperator(getConditionValue(context, condition.field), condition.operator, condition.value);
}

export function evaluateConditions(conditions: WorkflowCondition[] | undefined, context: ExecutionContext | Record<string, unknown>) {
  return (conditions ?? []).every((condition) => evaluateCondition(condition, context));
}
