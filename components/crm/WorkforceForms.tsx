"use client";

import { ActionForm } from "./ActionForm";
import {
  approveTimesheet,
  clockIn,
  clockOut,
  createStaffShift,
  editTimeEntry,
  endBreak,
  requestPto,
  reviewPtoRequest,
  startBreak,
  updateStaffShiftStatus,
  updateWorkforceSettings,
  upsertEmploymentProfile,
  upsertShiftTemplate
} from "@/app/workforce-actions";

type Option = {
  id: string;
  name: string;
};

type LocationOption = Option & {
  slug?: string;
};

export function StaffShiftForm({
  users,
  locations,
  templates
}: {
  users: Option[];
  locations: LocationOption[];
  templates: Option[];
}) {
  return (
    <ActionForm action={createStaffShift} submitLabel="Create Shift" successMessage="Shift created.">
      <label>Employee<select name="user_id" required>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <label>Location<select name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label>Template<select name="template_id"><option value="">No template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
      <div className="form-grid">
        <label>Date<input name="shift_date" required type="date" /></label>
        <label>Start<input name="start_time" required type="time" /></label>
        <label>End<input name="end_time" required type="time" /></label>
        <label>Unpaid break<input defaultValue="30" min="0" name="unpaid_break_minutes" type="number" /></label>
      </div>
      <label>Status<select name="status" required><option value="scheduled">Scheduled</option><option value="draft">Draft</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      <label>Role label<input name="role_label" placeholder="Front desk, provider, sales" /></label>
      <label>Notes<textarea name="notes" rows={3} /></label>
    </ActionForm>
  );
}

export function ShiftStatusForm({ shiftId, status }: { shiftId: string; status: string }) {
  return (
    <ActionForm action={updateStaffShiftStatus} className="inline-form" submitLabel="Update" successMessage="Shift updated.">
      <input name="shift_id" type="hidden" value={shiftId} />
      <select defaultValue={status} name="status">
        <option value="draft">Draft</option>
        <option value="scheduled">Scheduled</option>
        <option value="completed">Completed</option>
        <option value="missed">Missed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </ActionForm>
  );
}

export function TimeClockForm({
  locations,
  openEntryId,
  shifts
}: {
  locations: LocationOption[];
  openEntryId?: string | null;
  shifts: Option[];
}) {
  if (openEntryId) {
    return (
      <div className="record-list">
        <ActionForm action={startBreak} submitLabel="Start Break" successMessage="Break started.">
          <input name="time_entry_id" type="hidden" value={openEntryId} />
          <label className="checkbox-row"><input name="paid" type="checkbox" /> Paid break</label>
        </ActionForm>
        <ActionForm action={endBreak} submitLabel="End Break" successMessage="Break ended.">
          <input name="time_entry_id" type="hidden" value={openEntryId} />
        </ActionForm>
        <ActionForm action={clockOut} submitLabel="Clock Out" successMessage="Clocked out.">
          <input name="time_entry_id" type="hidden" value={openEntryId} />
          <label>Notes<textarea name="notes" rows={3} /></label>
        </ActionForm>
      </div>
    );
  }

  return (
    <ActionForm action={clockIn} submitLabel="Clock In" successMessage="Clocked in.">
      <label>Location<select name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label>Shift<select name="shift_id"><option value="">Unscheduled clock-in</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select></label>
      <label>Notes<textarea name="notes" rows={3} /></label>
    </ActionForm>
  );
}

export function PTORequestForm({ policies }: { policies: Option[] }) {
  return (
    <ActionForm action={requestPto} submitLabel="Request PTO" successMessage="PTO request submitted.">
      <label>Policy<select name="policy_id" required>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label>
      <div className="form-grid">
        <label>Start date<input name="start_date" required type="date" /></label>
        <label>End date<input name="end_date" required type="date" /></label>
        <label>Hours<input defaultValue="8" min="0.25" name="requested_hours" step="0.25" type="number" /></label>
      </div>
      <label>Reason<textarea name="reason" rows={3} /></label>
    </ActionForm>
  );
}

export function PTOReviewForm({ requestId, status }: { requestId: string; status: string }) {
  return (
    <ActionForm action={reviewPtoRequest} className="inline-form" submitLabel="Review" successMessage="PTO reviewed.">
      <input name="pto_request_id" type="hidden" value={requestId} />
      <select defaultValue={status} name="status">
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="denied">Denied</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <input name="review_notes" placeholder="Review note" />
    </ActionForm>
  );
}

export function TimesheetApprovalForm({ timesheetId, status }: { timesheetId: string; status: string }) {
  return (
    <ActionForm action={approveTimesheet} className="inline-form" submitLabel="Save" successMessage="Timesheet updated.">
      <input name="timesheet_id" type="hidden" value={timesheetId} />
      <select defaultValue={status} name="status">
        <option value="draft">Draft</option>
        <option value="review">Review</option>
        <option value="approved">Approved</option>
        <option value="reopened">Reopened</option>
      </select>
    </ActionForm>
  );
}

export function TimeEntryEditForm({ entry, locations }: { entry: Record<string, string | number | null>; locations: LocationOption[] }) {
  return (
    <ActionForm action={editTimeEntry} submitLabel="Save Entry" successMessage="Time entry saved.">
      <input name="time_entry_id" type="hidden" value={String(entry.id)} />
      <label>Location<select defaultValue={String(entry.location_id ?? "")} name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label>Clock in<input defaultValue={String(entry.clock_in_at ?? "").slice(0, 16)} name="clock_in_at" required type="datetime-local" /></label>
      <label>Clock out<input defaultValue={String(entry.clock_out_at ?? "").slice(0, 16)} name="clock_out_at" type="datetime-local" /></label>
      <label>Status<select defaultValue={String(entry.status ?? "completed")} name="status"><option value="open">Open</option><option value="completed">Completed</option><option value="edited">Edited</option><option value="approved">Approved</option><option value="void">Void</option></select></label>
      <label>Notes<textarea defaultValue={String(entry.notes ?? "")} name="notes" rows={3} /></label>
    </ActionForm>
  );
}

export function EmploymentProfileForm({ users, locations }: { users: Option[]; locations: LocationOption[] }) {
  return (
    <ActionForm action={upsertEmploymentProfile} submitLabel="Save Employee" successMessage="Employee profile saved.">
      <label>Employee<select name="user_id" required>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <label>Primary location<select name="primary_location_id"><option value="">None</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <div className="form-grid">
        <label>Employee #<input name="employee_number" /></label>
        <label>Job title<input name="job_title" /></label>
        <label>Hire date<input name="hire_date" type="date" /></label>
        <label>Status<select defaultValue="active" name="status"><option value="active">Active</option><option value="leave">Leave</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></select></label>
      </div>
      <label>Employment type<select defaultValue="hourly" name="employment_type"><option value="hourly">Hourly</option><option value="salary">Salary</option><option value="contractor">Contractor</option><option value="per_diem">Per diem</option><option value="other">Other</option></select></label>
      <div className="form-grid">
        <label>Hourly rate<input min="0" name="hourly_rate" step="0.01" type="number" /></label>
        <label>Annual salary<input min="0" name="annual_salary" step="0.01" type="number" /></label>
        <label>Overtime multiplier<input defaultValue="1.5" min="1" name="overtime_multiplier" step="0.1" type="number" /></label>
        <label>Payroll external ID<input name="payroll_external_id" /></label>
      </div>
      <label className="checkbox-row"><input defaultChecked name="overtime_eligible" type="checkbox" /> Overtime eligible</label>
      <label className="checkbox-row"><input name="exempt" type="checkbox" /> Exempt</label>
      <label className="checkbox-row"><input name="commission_eligible" type="checkbox" /> Commission eligible</label>
      <label>Notes<textarea name="notes" rows={3} /></label>
    </ActionForm>
  );
}

export function ShiftTemplateForm({ locations }: { locations: LocationOption[] }) {
  return (
    <ActionForm action={upsertShiftTemplate} submitLabel="Save Template" successMessage="Template saved.">
      <label>Name<input name="name" required /></label>
      <label>Location<select name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <div className="form-grid">
        <label>Start<input name="start_time" required type="time" /></label>
        <label>End<input name="end_time" required type="time" /></label>
        <label>Unpaid break<input defaultValue="30" min="0" name="unpaid_break_minutes" type="number" /></label>
        <label>Color<input defaultValue="#2563eb" name="color" type="color" /></label>
      </div>
      <label className="checkbox-row"><input defaultChecked name="active" type="checkbox" /> Active</label>
    </ActionForm>
  );
}

export function WorkforceSettingsForm({ settings }: { settings?: Record<string, string | number | boolean | null> | null }) {
  return (
    <ActionForm action={updateWorkforceSettings} submitLabel="Save Settings" successMessage="Workforce settings saved.">
      <label>Pay frequency<select defaultValue={String(settings?.pay_frequency ?? "biweekly")} name="pay_frequency"><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="semimonthly">Semi-monthly</option><option value="monthly">Monthly</option></select></label>
      <div className="form-grid">
        <label>OT weekly hours<input defaultValue={Number(settings?.overtime_weekly_threshold_minutes ?? 2400) / 60} min="1" name="overtime_weekly_threshold_hours" type="number" /></label>
        <label>OT multiplier<input defaultValue={Number(settings?.overtime_multiplier ?? 1.5)} min="1" name="overtime_multiplier" step="0.1" type="number" /></label>
        <label>Salary annual hours<input defaultValue={Number(settings?.annual_salary_work_minutes ?? 124800) / 60} min="1" name="annual_salary_work_hours" type="number" /></label>
        <label>Default break<input defaultValue={Number(settings?.default_unpaid_break_minutes ?? 30)} min="0" name="default_unpaid_break_minutes" type="number" /></label>
      </div>
      <div className="form-grid">
        <label>Early grace<input defaultValue={Number(settings?.early_clock_in_grace_minutes ?? 15)} min="0" name="early_clock_in_grace_minutes" type="number" /></label>
        <label>Late grace<input defaultValue={Number(settings?.late_clock_in_grace_minutes ?? 7)} min="0" name="late_clock_in_grace_minutes" type="number" /></label>
      </div>
      <label className="checkbox-row"><input defaultChecked={Boolean(settings?.require_scheduled_shift)} name="require_scheduled_shift" type="checkbox" /> Require scheduled shift</label>
      <label className="checkbox-row"><input defaultChecked={settings?.allow_unscheduled_clock_in !== false} name="allow_unscheduled_clock_in" type="checkbox" /> Allow unscheduled clock-in</label>
    </ActionForm>
  );
}
