const repeatingWhitespace = /\s+/g;
const punctuation = /[^\w\s]/g;

export const normalizeDescription = (input: string): string => {
  return input
    .normalize('NFKD')
    .replace(punctuation, ' ')
    .replace(repeatingWhitespace, ' ')
    .trim()
    .toLowerCase();
};
