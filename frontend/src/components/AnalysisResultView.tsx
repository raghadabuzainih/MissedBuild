import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type {
  AnalysisResult,
  AnalysisResultV3,
  AnalysisSection,
  AnalysisSource,
  EvidenceLabel,
  EvidenceStatus,
  LegacyAnalysisResult,
  TechnicalArea,
} from "../api/types";
import { UNAVAILABLE_REASONS } from "../utils/analysisStages";
import { ExpandMoreIcon } from "./icons";

const LABELS: Record<EvidenceLabel, { color: "success" | "info" | "warning"; help: string }> = {
  fact: { color: "success", help: "Stated in the repository's README or one of its issues, or shown by its code or structure." },
  inference: { color: "info", help: "Follows from the evidence, but is not stated directly." },
  hypothesis: { color: "warning", help: "A plausible idea that the evidence does not directly support." },
};

const STATUSES: Record<EvidenceStatus, { label: string; color: "success" | "default"; help: string }> = {
  verified_gap: { label: "Verified gap", color: "success", help: "An open issue or the README states this gap or request." },
  needs_investigation: {
    label: "Needs investigation",
    color: "default",
    help: "Suggested from the evidence, but not confirmed by an open issue or the README. Check before relying on it.",
  },
};

const AREAS: Record<TechnicalArea, string> = {
  code_quality: "Code quality",
  compatibility: "Compatibility",
  refactoring: "Refactoring",
  testing: "Testing",
  documentation: "Documentation",
};

const KINDS = { missing_feature: "Missing feature", improvement: "Improvement", feature_request: "Feature request" };

// Also used by the landing page's illustrative analysis preview.
export function LabelChip({ label }: { label: EvidenceLabel }) {
  return (
    <Tooltip title={LABELS[label].help}>
      <Chip size="small" variant="outlined" color={LABELS[label].color} label={label} sx={{ textTransform: "capitalize" }} />
    </Tooltip>
  );
}

// Also used by the comparison of analyses.
export function StatusChip({ status }: { status: EvidenceStatus }) {
  const { label, color, help } = STATUSES[status];
  return (
    <Tooltip title={help}>
      <Chip size="small" color={color} variant={status === "verified_gap" ? "filled" : "outlined"} label={label} sx={{ mr: 1, mb: 0.5 }} />
    </Tooltip>
  );
}

function sourceName(source: AnalysisSource): string {
  if (source.type === "readme") return "README";
  if (source.type === "issue") return `Issue #${source.issueNumber}`;
  if (source.type === "structure") return "Repository structure";
  return `File: ${source.path}${source.line ? ` (L${source.line})` : ""}`;
}

const EXCERPT_MODES = { full: "whole file", head: "start only", head_outline: "start + declarations", outline: "declarations only" };

// Links come from the backend (README, stored issues, a source file or the
// file tree at the analyzed commit). Excerpts are verbatim source text and
// are rendered as plain text, never as HTML.
function Sources({ sources }: { sources: AnalysisSource[] }) {
  if (sources.length === 0) return null;
  return (
    <Stack spacing={0.75} sx={{ mt: 1 }}>
      {sources.map((source) => (
        <Box key={source.url}>
          <Link
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            underline="hover"
            sx={{ wordBreak: "break-all" }}
          >
            {sourceName(source)}
          </Link>
          {source.excerpt && (
            <Typography
              variant="caption"
              component="blockquote"
              color="text.secondary"
              sx={{ display: "block", m: 0, mt: 0.25, pl: 1, borderLeft: 2, borderColor: "divider", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {source.excerpt}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}

// `prominent`: a larger, colored title (project ideas).
function Item({
  label,
  title,
  prominent = false,
  children,
  sources,
}: {
  label: EvidenceLabel;
  title?: string;
  prominent?: boolean;
  children: ReactNode;
  sources: AnalysisSource[];
}) {
  return (
    <Box component="li" sx={{ listStyle: "none", py: 1.5, borderBottom: 1, borderColor: "divider", "&:last-child": { borderBottom: 0 } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {title &&
            (prominent ? (
              <Typography
                variant="h6"
                component="h4"
                // Darker teal on light backgrounds keeps the contrast readable.
                sx={[{ color: "secondary.dark", lineHeight: 1.3, mb: 0.75 }, (theme) => theme.applyStyles("dark", { color: (theme.vars ?? theme).palette.secondary.main })]}
              >
                {title}
              </Typography>
            ) : (
              <Typography variant="subtitle2">{title}</Typography>
            ))}
          {/* A div, not a p: children can include chips and other block content. */}
          <Typography variant="body2" component="div">
            {children}
          </Typography>
        </Box>
        <LabelChip label={label} />
      </Stack>
      <Sources sources={sources} />
    </Box>
  );
}

type SectionState = { unavailable: UnavailableReason | null; dropped: number };
type UnavailableReason = NonNullable<AnalysisResultV3["unavailableSections"]>[number]["reason"];

// Whether a section of the AI's reply could be used, and how many of its items were left out.
function sectionState(result: AnalysisResult, section: AnalysisSection): SectionState {
  if (result.version !== 3) return { unavailable: null, dropped: 0 };
  return {
    unavailable: result.unavailableSections?.find((u) => u.section === section)?.reason ?? null,
    dropped: result.droppedItems?.[section] ?? 0,
  };
}

// A section that could not be processed: never shown as empty or as "nothing found".
function UnavailableNotice({ reason }: { reason: UnavailableReason }) {
  return (
    <Alert severity="warning" variant="outlined" sx={{ mt: 0.5 }}>
      Could not be processed: {UNAVAILABLE_REASONS[reason]}. This part of the analysis is unavailable, not empty. Re-analyze to try again.
    </Alert>
  );
}

function DroppedNote({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
      {count} {count === 1 ? "item was" : "items were"} left out because {count === 1 ? "it was" : "they were"} incomplete or duplicated in
      the AI&apos;s answer.
    </Typography>
  );
}

function Section({
  title,
  empty,
  emptyText,
  state = { unavailable: null, dropped: 0 },
  children,
}: {
  title: string;
  empty: boolean;
  emptyText?: string;
  state?: SectionState;
  children: ReactNode;
}) {
  return (
    <Box component="section" sx={{ mt: 3 }}>
      <Typography variant="overline" color="text.secondary" component="h3">
        {title}
      </Typography>
      {state.unavailable ? (
        <UnavailableNotice reason={state.unavailable} />
      ) : empty ? (
        <Typography variant="body2" color="text.disabled">
          {emptyText ?? "Nothing the evidence supports."}
        </Typography>
      ) : (
        <Box component="ul" sx={{ p: 0, m: 0 }}>
          {children}
        </Box>
      )}
      {!state.unavailable && <DroppedNote count={state.dropped} />}
    </Box>
  );
}

function BasedOn({ ids, names }: { ids: string[]; names: Map<string, string> }) {
  const known = ids.filter((id) => names.has(id));
  if (known.length === 0) return null;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mt: 1 }}>
      <Typography variant="caption" color="text.secondary">
        Based on:
      </Typography>
      {known.map((id) => {
        const name = names.get(id)!;
        return (
          <Tooltip key={id} title={name}>
            <Chip size="small" label={name.length > 40 ? `${name.slice(0, 40)}…` : name} />
          </Tooltip>
        );
      })}
    </Stack>
  );
}

// A labelled line inside an item: "Problem: ...".
function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <Box component="span" sx={{ display: "block", mt: 0.5, "&:first-of-type": { mt: 0 } }}>
      <strong>{name}:</strong> {children}
    </Box>
  );
}

function Summary({ result }: { result: AnalysisResult }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Typography variant="body1" sx={{ flexGrow: 1 }}>
          {result.summary.text}
        </Typography>
        <LabelChip label={result.summary.label} />
      </Stack>
      <Sources sources={result.summary.sources} />
    </Box>
  );
}

function Findings({ result }: { result: AnalysisResult }) {
  return (
    <>
      <Section title="Features" empty={result.features.length === 0} state={sectionState(result, "features")}>
        {result.features.map((f) => (
          <Item key={f.id} label={f.label} sources={f.sources}>
            {f.text}
          </Item>
        ))}
      </Section>

      <Section title="Limitations" empty={result.limitations.length === 0} state={sectionState(result, "limitations")}>
        {result.limitations.map((f) => (
          <Item key={f.id} label={f.label} sources={f.sources}>
            {f.text}
          </Item>
        ))}
      </Section>
    </>
  );
}

function EvidenceNotes({ result }: { result: AnalysisResult }) {
  const state = sectionState(result, "evidenceLimitations");
  return (
    <>
      {(result.evidenceLimitations.length > 0 || state.unavailable) && (
        <Box component="section" sx={{ mt: 3 }}>
          <Typography variant="overline" color="text.secondary" component="h3">
            What this analysis could not see
          </Typography>
          {/* Our own notes are still listed; only the AI's part is unavailable. */}
          {state.unavailable && <UnavailableNotice reason={state.unavailable} />}
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {result.evidenceLimitations.map((note) => (
              <Typography key={note} component="li" variant="body2" color="text.secondary">
                {note}
              </Typography>
            ))}
          </Box>
        </Box>
      )}

      {result.sourceFiles && result.sourceFiles.files.length > 0 && (
        <Box component="section" sx={{ mt: 3 }}>
          <Typography variant="overline" color="text.secondary" component="h3">
            Source files read
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {result.sourceFiles.files.map((file) => (
              <Typography key={file.path} component="li" variant="body2" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                {file.path}{" "}
                <Box component="span" sx={{ color: "text.disabled" }}>
                  ({EXCERPT_MODES[file.excerpt]}
                  {file.redactions > 0 ? `, ${file.redactions} value(s) redacted` : ""})
                </Box>
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </>
  );
}

// basedOn IDs point at findings, extensions or improvements; show their text, not IDs.
function namesOf(result: AnalysisResult): Map<string, string> {
  const findings = [...result.features, ...result.limitations].map((f) => [f.id, f.text] as const);
  if (result.version === 3) {
    return new Map([
      ...findings,
      ...result.functionalExtensions.map((e) => [e.id, e.title] as const),
      ...result.technicalImprovements.map((t) => [t.id, t.title] as const),
    ]);
  }
  return new Map([...findings, ...result.opportunities.map((o) => [o.id, o.title] as const)]);
}

// analysis-v3: future projects and user-facing extensions first; technical
// improvements last and collapsed.
function ResultV3({ result }: { result: AnalysisResultV3 }) {
  const names = namesOf(result);
  const improvements = sectionState(result, "technicalImprovements");
  return (
    <Box>
      <Summary result={result} />

      <Section
        title="Future project ideas"
        empty={result.projectIdeas.length === 0}
        emptyText="The evidence does not support a project idea."
        state={sectionState(result, "projectIdeas")}
      >
        {result.projectIdeas.map((idea) => (
          <Item key={idea.id} label={idea.label} title={idea.title} prominent sources={idea.sources}>
            <Field name="Problem">{idea.problem}</Field>
            <Field name="For">{idea.targetUsers}</Field>
            <Field name="Solution">{idea.solution}</Field>
            {idea.coreFeatures.length > 0 && <Field name="Core features">{idea.coreFeatures.join(" · ")}</Field>}
            {idea.reuse.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <strong>Reuse from this repository:</strong>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {idea.reuse.map((entry) => (
                    <Box component="li" key={entry.text}>
                      {entry.text}
                      <Sources sources={entry.sources} />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
            {idea.toBuild.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <strong>Still to build:</strong>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {idea.toBuild.map((part) => (
                    <li key={part}>{part}</li>
                  ))}
                </Box>
              </Box>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }} component="span">
              <Chip size="small" variant="outlined" label={`${idea.complexity} complexity`} />
            </Stack>
            <Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block", mt: 1 }}>
              Evidence limits: {idea.evidenceLimitations}
            </Typography>
            <BasedOn ids={idea.basedOn} names={names} />
          </Item>
        ))}
      </Section>

      <Section title="Functional extensions" empty={result.functionalExtensions.length === 0} state={sectionState(result, "functionalExtensions")}>
        {result.functionalExtensions.map((e) => (
          <Item key={e.id} label={e.label} title={e.title} sources={e.sources}>
            <StatusChip status={e.evidenceStatus} />
            {e.text}
            <Field name="Value for users">{e.userValue}</Field>
            <BasedOn ids={e.basedOn} names={names} />
          </Item>
        ))}
      </Section>

      <Findings result={result} />

      {/* Collapsed when available; shown open when unavailable or when every item was left out. */}
      {improvements.unavailable || (result.technicalImprovements.length === 0 && improvements.dropped > 0) ? (
        <Section title="Technical improvements" empty state={improvements}>
          {null}
        </Section>
      ) : (
        result.technicalImprovements.length > 0 && (
          <Accordion disableGutters variant="outlined" sx={{ mt: 3, "&::before": { display: "none" } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="overline" color="text.secondary" component="h3">
                Technical improvements ({result.technicalImprovements.length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Box component="ul" sx={{ p: 0, m: 0 }}>
                {result.technicalImprovements.map((t) => (
                  <Item key={t.id} label={t.label} title={t.title} sources={t.sources}>
                    <Chip size="small" label={AREAS[t.area]} sx={{ mr: 1, mb: 0.5 }} />
                    <StatusChip status={t.evidenceStatus} />
                    {t.text}
                    <BasedOn ids={t.basedOn} names={names} />
                  </Item>
                ))}
              </Box>
              <DroppedNote count={improvements.dropped} />
            </AccordionDetails>
          </Accordion>
        )
      )}

      <EvidenceNotes result={result} />
    </Box>
  );
}

// analysis-v1/v2 results, shown as they were saved.
function LegacyResult({ result }: { result: LegacyAnalysisResult }) {
  const names = namesOf(result);
  return (
    <Box>
      <Summary result={result} />
      <Findings result={result} />

      <Section title="Opportunities" empty={result.opportunities.length === 0}>
        {result.opportunities.map((o) => (
          <Item key={o.id} label={o.label} title={o.title} sources={o.sources}>
            <Chip size="small" label={KINDS[o.kind]} sx={{ mr: 1, mb: 0.5 }} />
            {o.text}
            <BasedOn ids={o.basedOn} names={names} />
          </Item>
        ))}
      </Section>

      <Section title="Project ideas" empty={result.projectIdeas.length === 0}>
        {result.projectIdeas.map((idea) => (
          <Item key={idea.id} label={idea.label} title={idea.title} prominent sources={idea.sources}>
            <Field name="Problem">{idea.problem}</Field>
            <Field name="Solution">{idea.solution}</Field>
            <Field name="For">{idea.intendedUsers}</Field>
            {idea.coreFeatures.length > 0 && <Field name="Core features">{idea.coreFeatures.join(" · ")}</Field>}
            <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }} component="span">
              <Chip size="small" variant="outlined" label={`${idea.complexity} complexity`} />
            </Stack>
            <Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block", mt: 1 }}>
              Evidence limits: {idea.evidenceLimitations}
            </Typography>
            <BasedOn ids={idea.basedOn} names={names} />
          </Item>
        ))}
      </Section>

      <EvidenceNotes result={result} />
    </Box>
  );
}

export default function AnalysisResultView({ result }: { result: AnalysisResult }) {
  return result.version === 3 ? <ResultV3 result={result} /> : <LegacyResult result={result} />;
}
