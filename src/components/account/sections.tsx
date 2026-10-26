"use client";

import { BriefcaseIcon, GraduationCapIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { saveEducationAction, saveExperienceAction, savePreferencesAction } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import type { Education, Experience, Preferences } from "@/lib/account/data";
import { formatMonthRange } from "@/lib/profile/format";
import { SUBJECT_GROUPS, subjectName } from "@/lib/profile/subjects";
import { DEGREE_LEVELS, EXPERIENCE_KINDS, MAX_EDUCATION, MAX_EXPERIENCE, VISA_TYPES } from "@/lib/profile/validate";
import { cn } from "@/lib/utils";
import { control, EntryCard, FieldMessage, FormDialog, Label } from "./form-dialog";
import { FormSelect } from "./form-select";

function SectionHeader({ id, title, why, action }: { id: string; title: string; why: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-xl">
        <h2 id={id} className="font-semi-expanded text-xl font-bold">{title}</h2>
        <p className="mt-1 text-[0.94rem] text-ink-soft">{why}</p>
      </div>
      {action}
    </div>
  );
}

function AddButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={disabled} className="h-10 gap-1.5 border-line bg-white px-3.5 text-[0.94rem] font-semibold">
      <PlusIcon /> {children}
    </Button>
  );
}

function EmptyState({ children, onAdd, label }: { children: React.ReactNode; onAdd: () => void; label: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-line bg-white p-6 text-center">
      <p className="text-ink-soft">{children}</p>
      <Button type="button" onClick={onAdd} className="mt-4 h-11 gap-1.5 px-4 text-[0.94rem] font-semibold">
        <PlusIcon /> {label}
      </Button>
    </div>
  );
}

const levelLabel = (v: string) => DEGREE_LEVELS.find((d) => d.value === v)?.label ?? "Degree";

const SUBJECT_OPTIONS = SUBJECT_GROUPS.map((g) => ({ label: g.group, options: g.subjects.map((s) => ({ label: s.name, value: s.code })) }));

function SubjectSelect({ id, name, defaultValue, required, invalid }: { id: string; name: string; defaultValue?: string; required?: boolean; invalid?: boolean }) {
  return (
    <FormSelect
      id={id}
      name={name}
      groups={SUBJECT_OPTIONS}
      defaultValue={defaultValue}
      placeholder={required ? "Choose a subject" : "No second subject"}
      clearable={!required}
      invalid={invalid}
    />
  );
}

// ── Education ────────────────────────────────────────────────────────────────

export function EducationSection({ items, currentYear }: { items: Education[]; currentYear: number }) {
  const [editing, setEditing] = useState<Education | "new" | null>(null);
  const entry = editing && editing !== "new" ? editing : null;
  const years = Array.from({ length: 47 }, (_, i) => currentYear + 6 - i);
  const full = items.length >= MAX_EDUCATION;

  return (
    <section aria-labelledby="education">
      <SectionHeader
        id="education"
        title="Education"
        why="Your degree subjects decide which jobs are matched to you, so a Computer Science graduate never sees nursing posts."
        action={items.length ? <AddButton onClick={() => setEditing("new")} disabled={full}>Add degree</AddButton> : null}
      />
      {items.length ? (
        <ul className="mt-4 space-y-3">
          {items.map((e) => (
            <EntryCard
              key={e.id}
              icon={<GraduationCapIcon />}
              title={`${levelLabel(e.level)} in ${e.subjects.map(subjectName).join(" and ")}`}
              lines={[e.university, e.graduationYear > currentYear ? `Finishing ${e.graduationYear}` : `Graduated ${e.graduationYear}`]}
              onEdit={() => setEditing(e)}
              deleteLabel="Delete this degree?"
              entry={{ kind: "education", id: e.id }}
            />
          ))}
        </ul>
      ) : (
        <EmptyState onAdd={() => setEditing("new")} label="Add your degree">
          Add your degree to see jobs matched to your subject.
        </EmptyState>
      )}

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={entry ? "Edit degree" : "Add a degree"}
        description="Choose the subject from the UK list universities use, so it maps cleanly to jobs."
        action={saveEducationAction}
        submitLabel={entry ? "Save changes" : "Add degree"}
      >
        {(errors) => (
          <>
            {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="level">Level</Label>
                <FormSelect id="level" name="level" options={[...DEGREE_LEVELS]} defaultValue={entry?.level} placeholder="Choose a level" invalid={!!errors?.level} />
                <FieldMessage id="level-error" errors={errors} name="level" />
              </div>
              <div>
                <Label htmlFor="graduationYear">Year completed, or will be</Label>
                <FormSelect
                  id="graduationYear"
                  name="graduationYear"
                  options={years.map((y) => ({ label: String(y), value: String(y) }))}
                  defaultValue={entry ? String(entry.graduationYear) : null}
                  placeholder="Choose a year"
                  invalid={!!errors?.graduationYear}
                  className="tabular"
                />
                <FieldMessage id="graduationYear-error" errors={errors} name="graduationYear" />
              </div>
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <SubjectSelect id="subject" name="subject" defaultValue={entry?.subjects[0]} required invalid={!!errors?.subject} />
              <FieldMessage id="subject-error" errors={errors} name="subject" />
            </div>
            <div>
              <Label htmlFor="subject2" optional>
                Second subject, for joint honours
              </Label>
              <SubjectSelect id="subject2" name="subject2" defaultValue={entry?.subjects[1]} />
            </div>
            <div>
              <Label htmlFor="university" optional>
                University
              </Label>
              <input id="university" name="university" defaultValue={entry?.university ?? ""} autoComplete="organization" className={control} />
            </div>
          </>
        )}
      </FormDialog>
    </section>
  );
}

// ── Experience ───────────────────────────────────────────────────────────────

const kindLabel = (v: string) => EXPERIENCE_KINDS.find((k) => k.value === v)?.label ?? "Job";

export function ExperienceSection({ items }: { items: Experience[] }) {
  const [editing, setEditing] = useState<Experience | "new" | null>(null);
  const entry = editing && editing !== "new" ? editing : null;
  const [current, setCurrent] = useState(false);
  const open = (e: Experience | "new") => {
    setCurrent(e !== "new" && !!e.startedOn && !e.endedOn);
    setEditing(e);
  };

  return (
    <section aria-labelledby="experience">
      <SectionHeader
        id="experience"
        title="Work and professional experience"
        why="Optional. Adds a second view of matches based on the work you've done, for example a Physics graduate working as a DevOps engineer."
        action={items.length ? <AddButton onClick={() => open("new")} disabled={items.length >= MAX_EXPERIENCE}>Add experience</AddButton> : null}
      />
      {items.length ? (
        <ul className="mt-4 space-y-3">
          {items.map((e) => (
            <EntryCard
              key={e.id}
              icon={<BriefcaseIcon />}
              title={e.title}
              // An ordinary job needs no type label; internships, placements and volunteering do.
              lines={[[e.employer, e.kind === "job" ? null : kindLabel(e.kind)].filter(Boolean).join(", ") || null, formatMonthRange(e.startedOn, e.endedOn)]}
              onEdit={() => open(e)}
              deleteLabel="Delete this experience?"
              entry={{ kind: "experience", id: e.id }}
            />
          ))}
        </ul>
      ) : (
        <EmptyState onAdd={() => open("new")} label="Add experience">
          Jobs, internships, placement years and volunteering all count.
        </EmptyState>
      )}

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={entry ? "Edit experience" : "Add experience"}
        action={saveExperienceAction}
        submitLabel={entry ? "Save changes" : "Add experience"}
      >
        {(errors) => (
          <>
            {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
            <div>
              <Label htmlFor="title">Job title</Label>
              <input id="title" name="title" defaultValue={entry?.title ?? ""} aria-invalid={!!errors?.title || undefined} className={control} />
              <FieldMessage id="title-error" errors={errors} name="title" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="employer" optional>
                  Employer
                </Label>
                <input id="employer" name="employer" defaultValue={entry?.employer ?? ""} autoComplete="organization" className={control} />
              </div>
              <div>
                <Label htmlFor="kind">Type</Label>
                <FormSelect id="kind" name="kind" options={[...EXPERIENCE_KINDS]} defaultValue={entry?.kind ?? "job"} placeholder="Choose a type" />
              </div>
              <div>
                <Label htmlFor="start" optional>
                  From
                </Label>
                <input id="start" name="start" type="month" defaultValue={entry?.startedOn?.slice(0, 7) ?? ""} aria-invalid={!!errors?.start || undefined} className={cn(control, "tabular")} />
                <FieldMessage id="start-error" errors={errors} name="start" />
              </div>
              <div>
                <Label htmlFor="end" optional>
                  To
                </Label>
                <input
                  id="end"
                  name="end"
                  type="month"
                  disabled={current}
                  defaultValue={entry?.endedOn?.slice(0, 7) ?? ""}
                  aria-invalid={!!errors?.end || undefined}
                  className={cn(control, "tabular disabled:bg-paper disabled:text-ink-soft")}
                />
                <FieldMessage id="end-error" errors={errors} name="end" />
              </div>
            </div>
            <label className="flex items-center gap-2.5 text-[0.94rem]">
              <input type="checkbox" name="current" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="size-4 accent-teal" />
              I work here now
            </label>
          </>
        )}
      </FormDialog>
    </section>
  );
}

// ── Job preferences ──────────────────────────────────────────────────────────

export function PreferencesSection({ preferences }: { preferences: Preferences | null }) {
  const [open, setOpen] = useState(false);
  const visa = VISA_TYPES.find((v) => v.value === preferences?.visaType)?.label;
  const expiry = preferences?.visaExpiry ? new Date(`${preferences.visaExpiry}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
  const where = preferences?.locations.length ? preferences.locations.join(", ") : "Anywhere in the UK";

  return (
    <section aria-labelledby="preferences">
      <SectionHeader
        id="preferences"
        title="Job preferences"
        why="Where you want to work filters your matches. Your visa is optional, and used only to flag jobs that close after it ends."
        action={
          <Button type="button" variant="outline" onClick={() => setOpen(true)} className="h-10 border-line bg-white px-3.5 text-[0.94rem] font-semibold">
            Edit
          </Button>
        }
      />
      <dl className="mt-4 divide-y divide-line rounded-lg border border-line bg-white px-5">
        <div className="grid gap-1 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="text-sm text-ink-soft">Where</dt>
          <dd className="font-semibold">
            {where}
            {preferences?.remoteOk !== false ? ", and remote" : ""}
          </dd>
        </div>
        <div className="grid gap-1 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="text-sm text-ink-soft">Visa</dt>
          <dd className="font-semibold">{visa ? `${visa}${expiry ? `, until ${expiry}` : ""}` : "Not given"}</dd>
        </div>
      </dl>

      <FormDialog open={open} onOpenChange={setOpen} title="Job preferences" action={savePreferencesAction} submitLabel="Save preferences">
        {(errors) => (
          <>
            <div>
              <Label htmlFor="locations" optional>
                Towns or cities, separated by commas
              </Label>
              <input id="locations" name="locations" defaultValue={preferences?.locations.join(", ") ?? ""} placeholder="London, Manchester" className={control} />
              <p className="mt-1.5 text-sm text-ink-soft">Leave it empty to see jobs anywhere in the UK.</p>
            </div>
            <label className="flex items-center gap-2.5 text-[0.94rem]">
              <input type="checkbox" name="remoteOk" defaultChecked={preferences?.remoteOk ?? true} className="size-4 accent-teal" />
              Include remote jobs
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="visaType" optional>
                  Current visa
                </Label>
                <FormSelect id="visaType" name="visaType" options={[...VISA_TYPES]} defaultValue={preferences?.visaType} placeholder="Prefer not to say" clearable />
              </div>
              <div>
                <Label htmlFor="visaExpiry" optional>
                  Expiry date
                </Label>
                <input id="visaExpiry" name="visaExpiry" type="date" defaultValue={preferences?.visaExpiry ?? ""} aria-invalid={!!errors?.visaExpiry || undefined} className={cn(control, "tabular")} />
                <FieldMessage id="visaExpiry-error" errors={errors} name="visaExpiry" />
              </div>
            </div>
          </>
        )}
      </FormDialog>
    </section>
  );
}
