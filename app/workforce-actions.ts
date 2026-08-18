"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertWorkforcePermission, workforceLocationAllowed } from "@/lib/workforce/permissions";
import { emitDomainEvent } from "@/lib/workflows/server-events";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function checked(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function numberValue(value: FormDataEntryValue | null, fallback = 0) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function moneyToCents(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return Math.round(Number(text.replace(/[$,]/g, "")) * 100);
}

function assertLocation(profile: Awaited<ReturnType<typeof requireCurrentProfile>>, locationId: string | null) {
  if (locationId && !workforceLocationAllowed(profile, locationId)) {
    throw new Error("Selected location is not available for this user");
  }
}

async function audit(action: string, entityTable: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action,
    entity_table: entityTable,
    entity_id: entityId,
    metadata
  });
}

export async function upsertEmploymentProfile(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.compensation.manage");
  const supabase = await createClient();
  const userId = required(formData.get("user_id"), "Employee");
  const primaryLocationId = optional(formData.get("primary_location_id"));
  assertLocation(profile, primaryLocationId);
  const payload = {
    organization_id: profile.organizationId,
    user_id: userId,
    employee_number: optional(formData.get("employee_number")),
    employment_type: required(formData.get("employment_type"), "Employment type"),
    status: required(formData.get("status"), "Status"),
    hire_date: optional(formData.get("hire_date")),
    termination_date: optional(formData.get("termination_date")),
    primary_location_id: primaryLocationId,
    job_title: optional(formData.get("job_title")),
    exempt: checked(formData.get("exempt")),
    overtime_eligible: checked(formData.get("overtime_eligible")),
    overtime_multiplier: numberValue(formData.get("overtime_multiplier"), 1.5),
    hourly_rate_cents: moneyToCents(formData.get("hourly_rate")),
    annual_salary_cents: moneyToCents(formData.get("annual_salary")),
    commission_eligible: checked(formData.get("commission_eligible")),
    payroll_external_id: optional(formData.get("payroll_external_id")),
    notes: optional(formData.get("notes"))
  };
  const { error } = await supabase.from("employment_profiles").upsert(payload, { onConflict: "organization_id,user_id" });
  if (error) throw new Error(error.message);
  await audit("Employment Profile Updated", "employment_profiles", userId);
  revalidatePath("/settings/workforce/employees");
  revalidatePath(`/staff/${userId}`);
}

export async function upsertShiftTemplate(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.settings.manage");
  const supabase = await createClient();
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const templateId = optional(formData.get("template_id"));
  const payload = {
    organization_id: profile.organizationId,
    location_id: locationId,
    name: required(formData.get("name"), "Template name"),
    start_time: required(formData.get("start_time"), "Start time"),
    end_time: required(formData.get("end_time"), "End time"),
    unpaid_break_minutes: numberValue(formData.get("unpaid_break_minutes")),
    color: optional(formData.get("color")) ?? "#2563eb",
    active: checked(formData.get("active"))
  };
  const query = templateId
    ? supabase.from("shift_templates").update(payload).eq("id", templateId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("shift_templates").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit("Shift Template Saved", "shift_templates", data.id);
  revalidatePath("/settings/workforce/shift-templates");
  revalidatePath("/staff/schedule");
}

export async function createStaffShift(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.schedule.write");
  const supabase = await createClient();
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const assignedUserId = required(formData.get("user_id"), "Employee");
  const startAt = new Date(`${required(formData.get("shift_date"), "Date")}T${required(formData.get("start_time"), "Start time")}`);
  const endAt = new Date(`${required(formData.get("shift_date"), "Date")}T${required(formData.get("end_time"), "End time")}`);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    throw new Error("Choose a valid shift time");
  }
  const { data, error } = await supabase.from("staff_shifts").insert({
    organization_id: profile.organizationId,
    location_id: locationId,
    user_id: assignedUserId,
    shift_template_id: optional(formData.get("template_id")),
    shift_date: required(formData.get("shift_date"), "Date"),
    scheduled_start: startAt.toISOString(),
    scheduled_end: endAt.toISOString(),
    break_minutes: numberValue(formData.get("unpaid_break_minutes")),
    status: required(formData.get("status"), "Status"),
    notes: optional(formData.get("role_label")) ?? optional(formData.get("notes")),
    created_by: profile.id
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Staff Shift Created", "staff_shifts", data.id, { location_id: locationId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "staff.shift_created", entityType: "staff_shift", entityId: data.id, locationId, payload: { user_id: assignedUserId, scheduled_start: startAt.toISOString() } });
  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
}

export async function updateStaffShiftStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.schedule.write");
  const supabase = await createClient();
  const shiftId = required(formData.get("shift_id"), "Shift");
  const status = required(formData.get("status"), "Status");
  const { data: shift, error: shiftError } = await supabase.from("staff_shifts").select("id, location_id").eq("id", shiftId).eq("organization_id", profile.organizationId).single();
  if (shiftError || !shift) throw new Error(shiftError?.message ?? "Shift was not found");
  assertLocation(profile, shift.location_id);
  const { error } = await supabase.from("staff_shifts").update({ status }).eq("id", shiftId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await audit("Staff Shift Status Updated", "staff_shifts", shiftId, { status });
  revalidatePath("/staff/schedule");
}

export async function clockIn(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.timeclock.use");
  const supabase = await createClient();
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const { data, error } = await supabase.rpc("clock_in", {
    target_location_id: locationId,
    target_shift_id: optional(formData.get("shift_id")),
    clock_notes: optional(formData.get("notes"))
  });
  if (error) throw new Error(error.message);
  await audit("Clock In", "time_entries", String(data), { location_id: locationId });
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "workforce.clock_in", entityType: "time_entry", entityId: String(data), locationId, payload: {} });
  revalidatePath("/time-clock");
  revalidatePath("/staff");
}

export async function startBreak(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.timeclock.use");
  const supabase = await createClient();
  const timeEntryId = required(formData.get("time_entry_id"), "Time entry");
  const { error } = await supabase.rpc("start_time_break", {
    target_time_entry_id: timeEntryId,
    break_paid: checked(formData.get("paid"))
  });
  if (error) throw new Error(error.message);
  await audit("Break Started", "time_entry_breaks", timeEntryId);
  revalidatePath("/time-clock");
}

export async function endBreak(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.timeclock.use");
  const supabase = await createClient();
  const timeEntryId = required(formData.get("time_entry_id"), "Time entry");
  const { error } = await supabase.rpc("end_time_break", { target_time_entry_id: timeEntryId });
  if (error) throw new Error(error.message);
  await audit("Break Ended", "time_entry_breaks", timeEntryId);
  revalidatePath("/time-clock");
}

export async function clockOut(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.timeclock.use");
  const supabase = await createClient();
  const timeEntryId = required(formData.get("time_entry_id"), "Time entry");
  const { error } = await supabase.rpc("clock_out", {
    target_time_entry_id: timeEntryId,
    clock_notes: optional(formData.get("notes"))
  });
  if (error) throw new Error(error.message);
  await audit("Clock Out", "time_entries", timeEntryId);
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "workforce.clock_out", entityType: "time_entry", entityId: timeEntryId, payload: {} });
  revalidatePath("/time-clock");
  revalidatePath("/staff");
}

export async function editTimeEntry(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.time_entries.manage");
  const supabase = await createClient();
  const timeEntryId = required(formData.get("time_entry_id"), "Time entry");
  const locationId = required(formData.get("location_id"), "Location");
  assertLocation(profile, locationId);
  const { error } = await supabase.from("time_entries").update({
    location_id: locationId,
    clock_in_at: new Date(required(formData.get("clock_in_at"), "Clock in")).toISOString(),
    clock_out_at: optional(formData.get("clock_out_at")) ? new Date(required(formData.get("clock_out_at"), "Clock out")).toISOString() : null,
    status: required(formData.get("status"), "Status"),
    source: "manager_entry",
    notes: optional(formData.get("notes"))
  }).eq("id", timeEntryId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await supabase.rpc("calculate_time_entry_minutes", { target_time_entry_id: timeEntryId });
  await supabase.from("time_entry_audits").insert({
    organization_id: profile.organizationId,
    time_entry_id: timeEntryId,
    edited_by: profile.id,
    original_values: {},
    new_values: Object.fromEntries(formData.entries()),
    reason: optional(formData.get("notes")) ?? "Manager time entry edit"
  });
  await audit("Time Entry Edited", "time_entries", timeEntryId);
  revalidatePath("/staff/timesheets");
  revalidatePath("/reports/labor-cost");
}

export async function requestPto(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.pto.request");
  const supabase = await createClient();
  const policyId = required(formData.get("policy_id"), "PTO policy");
  const startDate = required(formData.get("start_date"), "Start date");
  const endDate = required(formData.get("end_date"), "End date");
  const requestedMinutes = numberValue(formData.get("requested_hours")) * 60;
  const { data, error } = await supabase.from("pto_requests").insert({
    organization_id: profile.organizationId,
    user_id: profile.id,
    policy_id: policyId,
    start_date: startDate,
    end_date: endDate,
    requested_minutes: requestedMinutes,
    status: "pending",
    reason: optional(formData.get("reason"))
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("PTO Requested", "pto_requests", data.id);
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "staff.pto_requested", entityType: "pto_request", entityId: data.id, payload: { requested_minutes: requestedMinutes } });
  revalidatePath("/staff/time-off");
}

export async function reviewPtoRequest(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.pto.manage");
  const supabase = await createClient();
  const requestId = required(formData.get("pto_request_id"), "PTO request");
  const status = required(formData.get("status"), "Status");
  const { data: request, error: requestError } = await supabase.from("pto_requests").select("id, user_id, policy_id").eq("id", requestId).eq("organization_id", profile.organizationId).single();
  if (requestError || !request) throw new Error(requestError?.message ?? "PTO request was not found");
  const { error } = await supabase.from("pto_requests").update({
    status,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
    review_notes: optional(formData.get("review_notes"))
  }).eq("id", requestId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await supabase.rpc("recalculate_pto_balance", { target_user_id: request.user_id, target_policy_id: request.policy_id });
  await audit("PTO Reviewed", "pto_requests", requestId, { status });
  revalidatePath("/staff/time-off");
}

export async function approveTimesheet(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.timesheets.approve");
  const supabase = await createClient();
  const timesheetId = required(formData.get("timesheet_id"), "Timesheet");
  const { error } = await supabase.from("timesheets").update({
    status: required(formData.get("status"), "Status"),
    approved_by: profile.id,
    approved_at: new Date().toISOString()
  }).eq("id", timesheetId).eq("organization_id", profile.organizationId);
  if (error) throw new Error(error.message);
  await audit("Timesheet Reviewed", "timesheets", timesheetId);
  await emitDomainEvent({ organizationId: profile.organizationId, eventType: "staff.timesheet_approved", entityType: "timesheet", entityId: timesheetId, payload: {} });
  revalidatePath("/staff/timesheets");
}

export async function updateWorkforceSettings(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertWorkforcePermission(profile, "workforce.settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("workforce_settings").upsert({
    organization_id: profile.organizationId,
    pay_frequency: required(formData.get("pay_frequency"), "Pay frequency"),
    overtime_weekly_threshold_minutes: numberValue(formData.get("overtime_weekly_threshold_hours"), 40) * 60,
    overtime_multiplier: numberValue(formData.get("overtime_multiplier"), 1.5),
    annual_salary_work_minutes: numberValue(formData.get("annual_salary_work_hours"), 2080) * 60,
    early_clock_in_grace_minutes: numberValue(formData.get("early_clock_in_grace_minutes"), 15),
    late_clock_in_grace_minutes: numberValue(formData.get("late_clock_in_grace_minutes"), 7),
    default_unpaid_break_minutes: numberValue(formData.get("default_unpaid_break_minutes"), 30),
    require_scheduled_shift: checked(formData.get("require_scheduled_shift")),
    allow_unscheduled_clock_in: checked(formData.get("allow_unscheduled_clock_in"))
  }, { onConflict: "organization_id" });
  if (error) throw new Error(error.message);
  await audit("Workforce Settings Updated", "workforce_settings", null);
  revalidatePath("/settings/workforce");
}
