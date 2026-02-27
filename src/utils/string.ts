// String utility functions
// Fuzzy matching and text processing

/**
 * Fuzzy match a query against a list of strings
 * Uses SequenceMatcher algorithm similar to Python's difflib
 */
export function fuzzyMatch(
  query: string,
  targets: string[],
  threshold = 0.6
): string[] {
  const queryLower = query.toLowerCase();

  // Exact matches
  const exactMatches = targets.filter((t) => t.toLowerCase().includes(queryLower));
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  // Fuzzy matches
  const matches: { target: string; ratio: number }[] = [];

  for (const target of targets) {
    const ratio = calculateSimilarity(queryLower, target.toLowerCase());
    if (ratio >= threshold) {
      matches.push({ target, ratio });
    }
  }

  // Sort by similarity ratio descending
  matches.sort((a, b) => b.ratio - a.ratio);

  return matches.map((m) => m.target);
}

/**
 * Calculate similarity ratio between two strings
 * Uses SequenceMatcher algorithm (like Python's difflib)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  // Handle empty strings
  if (str1.length === 0 && str2.length === 0) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  // Build longest common subsequence matrix
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcsLength = dp[m][n];
  const maxLength = Math.max(m, n);

  return (2 * lcsLength) / (m + n);
}

/**
 * Find best matching string from a list
 */
export function findBestMatch(
  query: string,
  targets: string[]
): string | null {
  const matches = fuzzyMatch(query, targets, 0.3); // Lower threshold for best match
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Convert text to title case
 */
export function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Slugify a string (for URLs, filenames, etc.)
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extract initials from a name
 */
export function getInitials(name: string, maxLength = 2): string {
  return name
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, maxLength)
    .join('');
}

/**
 * Generate a random string ID
 */
export function generateId(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
