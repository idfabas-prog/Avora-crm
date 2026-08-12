const supportedVariables = [
  "first_name",
  "last_name",
  "location_name",
  "appointment_date",
  "appointment_time",
  "appointment_type",
  "provider_name",
  "salesperson_name",
  "balance_due"
] as const;

type TemplateValues = Partial<Record<(typeof supportedVariables)[number], string>>;

export function renderSmsTemplate(body: string, values: TemplateValues) {
  let rendered = body;
  const missing: string[] = [];

  for (const variable of supportedVariables) {
    const token = `{{${variable}}}`;
    if (!rendered.includes(token)) {
      continue;
    }

    const value = values[variable];
    if (!value) {
      missing.push(variable);
      continue;
    }

    rendered = rendered.replaceAll(token, value);
  }

  const unresolved = (rendered.match(/{{\s*[\w_]+\s*}}/g) ?? [])
    .map((token) => token.replace(/[{}\s]/g, ""))
    .filter((variable) => !missing.includes(variable));

  return {
    rendered,
    missing: [...missing, ...unresolved]
  };
}
