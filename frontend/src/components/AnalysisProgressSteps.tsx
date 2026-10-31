import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";
import type { AnalysisProgress } from "../api/types";
import { STAGES, formatElapsed } from "../utils/analysisStages";

// The analysis stages exactly as the backend reports them: completed ones are
// checked, the current one shows its server-measured time, later ones wait.
// Nothing is simulated: without a report yet, it only says it is starting.
export default function AnalysisProgressSteps({ progress }: { progress: AnalysisProgress | null }) {
  if (!progress) {
    return (
      <Typography variant="body2" role="status">
        Starting the analysis…
      </Typography>
    );
  }
  const current = progress.stage ?? progress.failedStage;
  const activeStep = current ? STAGES.findIndex((s) => s.id === current) : STAGES.length;
  const currentLabel = STAGES.find((s) => s.id === progress.stage)?.label;

  return (
    <Box>
      {/* Read out when the stage changes, not on every elapsed-time update. */}
      <Typography variant="body2" role="status" aria-live="polite" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {progress.outcome === "failed" ? "The analysis failed." : currentLabel ? `${currentLabel}.` : ""}
      </Typography>
      <Stepper orientation="vertical" activeStep={activeStep} aria-label="Analysis progress">
        {STAGES.map((stage) => {
          const completed = progress.completed.includes(stage.id);
          const skipped = progress.skipped.includes(stage.id);
          const failed = progress.failedStage === stage.id;
          const running = progress.stage === stage.id;
          let caption: string | null = null;
          if (running && progress.stageElapsedMs !== null) {
            caption = `${formatElapsed(progress.stageElapsedMs)} so far.${stage.detail ? ` ${stage.detail}` : ""}`;
          } else if (skipped) caption = "Skipped: the source files could not be read. The analysis continues with the README and issues.";
          else if (failed) caption = "The analysis stopped here.";
          return (
            <Step key={stage.id} completed={completed || skipped}>
              <StepLabel
                error={failed}
                optional={
                  caption && (
                    <Typography variant="caption" color={failed ? "error" : "text.secondary"}>
                      {caption}
                    </Typography>
                  )
                }
              >
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                  {stage.label}
                  {running && <CircularProgress size={12} aria-hidden />}
                </Box>
              </StepLabel>
            </Step>
          );
        })}
      </Stepper>
    </Box>
  );
}
