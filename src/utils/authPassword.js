export const passwordPolicy = {
  minLength: 8,
  maxLength: 64,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true
};

export const getPasswordIssues = (password) => {
  const issues = [];

  if (password.length < passwordPolicy.minLength) {
    issues.push(`At least ${passwordPolicy.minLength} characters`);
  }
  if (password.length > passwordPolicy.maxLength) {
    issues.push(`No more than ${passwordPolicy.maxLength} characters`);
  }
  if (passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
    issues.push("One lowercase letter");
  }
  if (passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
    issues.push("One uppercase letter");
  }
  if (passwordPolicy.requireNumber && !/[0-9]/.test(password)) {
    issues.push("One number");
  }

  return issues;
};
