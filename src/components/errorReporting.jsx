export const reportError = ({ scope, message, error }) => {
  console.error(`[${scope}] ${message}:`, error);
};