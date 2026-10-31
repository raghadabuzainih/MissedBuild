import { createTheme } from "@mui/material/styles";

// Light and dark schemes follow the system preference.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "media" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#4f46e5" },
        secondary: { main: "#0d9488" },
        background: { default: "#f6f7fb", paper: "#ffffff" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#a5b4fc" },
        secondary: { main: "#5eead4" },
        background: { default: "#0e1117", paper: "#161b22" },
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: "clamp(2rem, 4vw + 1rem, 3.25rem)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Smooth scrolling for the landing page's anchor links, only when motion is allowed.
        "@media (prefers-reduced-motion: no-preference)": {
          html: { scrollBehavior: "smooth" },
        },
        // Respect the user's motion setting everywhere, including MUI transitions.
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            transitionDelay: "0ms !important",
          },
        },
      },
    },
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiChip: { styleOverrides: { label: { fontWeight: 500 } } },
  },
});
