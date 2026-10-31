import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ExpandMoreIcon } from "../icons";
import Reveal from "../Reveal";
import LandingSection, { type LandingTone } from "./LandingSection";

const QUESTIONS: { question: string; answer: string }[] = [
  {
    question: "Where do the results come from?",
    answer:
      "From GitHub's public repository search. MissedBuild shows up to 5 repositories that match your idea, and fewer when fewer are relevant: unrelated results are left out rather than used to fill the list. They're numbered by how closely they match your idea, with the words you typed counting more than words the AI added.",
  },
  {
    question: "Which repository is analyzed automatically?",
    answer:
      "Only one per search: the closest match that has enough README or issue content to analyze. If none has enough, nothing is analyzed automatically and no AI request is made. A repository that was already analyzed shows its saved result instead. Every other repository is analyzed only when you ask.",
  },
  {
    question: "What do Analyzed, Not analyzed and partial mean?",
    answer:
      "Each card shows whether MissedBuild has a saved analysis of the repository: Analyzed (green) or Not analyzed. Analyzed (partial) means one part of the AI's answer couldn't be used: that part is shown as unavailable, never as empty, and everything else passed the usual evidence checks. Re-analyze to try for a complete analysis.",
  },
  {
    question: "Where do the categories on this page come from?",
    answer:
      "They group public GitHub repositories that earlier MissedBuild searches found and categorized. A category appears once it holds at least one repository, so this is not a full GitHub catalog. Only public GitHub information is shown, never what anyone searched for.",
  },
  {
    question: "How are repositories categorized?",
    answer:
      "By AI, using each repository's description, topics and the start of its README. If AI is unavailable, categories come from matching GitHub topics. When nothing fits clearly, the repository is labeled Other.",
  },
  {
    question: "What does an analysis read?",
    answer:
      "The repository's README, its most recently updated issues (up to 20 open and 10 closed; closed issues count as history, not as current problems), a map of its files, and parts of selected source files from each area of the project (up to about 30 files, mostly only their start or declarations). Dependencies, build output and lockfiles are never read, and values that look like passwords or API keys are removed first. Each analysis lists what it couldn't see.",
  },
  {
    question: "How long do searches and analyses take?",
    answer:
      "It depends on GitHub and the AI service. You'll see progress while a search runs. An analysis shows each real step as it happens, from reading the repository to waiting for the AI's answer and checking the evidence, with the time spent on the current step. It can take up to a few minutes, and you can close the panel while it works.",
  },
  {
    question: "What if a repository changes?",
    answer:
      "Repository details are refreshed when they're more than a day old, and the panel shows when a project has new commits since its last analysis. You can re-analyze at any time from the card or the panel. If the README, issues and the source files it reads haven't changed, you'll see the saved result, unless it was partial: then it is analyzed again.",
  }
];

export default function Faq({ tone = "default" }: { tone?: LandingTone }) {
  return (
    <LandingSection id="good-to-know" tone={tone} title="Good to know">
      <Box sx={{ maxWidth: 820 }}>
        {QUESTIONS.map(({ question, answer }, index) => (
          <Reveal key={question} index={index}>
            <Accordion
              disableGutters
              elevation={0}
              sx={{ border: 1, borderColor: "divider", borderBottomWidth: index < QUESTIONS.length - 1 ? 0 : 1, "&::before": { display: "none" } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>{question}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary">
                  {answer}
                </Typography>
              </AccordionDetails>
            </Accordion>
          </Reveal>
        ))}
      </Box>
    </LandingSection>
  );
}
