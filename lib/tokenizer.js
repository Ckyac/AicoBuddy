// lib/tokenizer.js - Lightweight on-device token estimator

(function() {
  const AicoTokenizer = {
    /**
     * Estimates the token count of a given text string.
     * Heuristics are optimized for both English (Latin) and Korean (Hangul) text.
     * @param {string} text 
     * @returns {number} Estimated token count
     */
    countTokens(text) {
      if (!text) return 0;
      let tokens = 0;

      // Regular expressions for script segmentation
      const koreanRegex = /[\uac00-\ud7a3]/g;
      const englishWordRegex = /[a-zA-Z0-9']+/g;
      const whitespaceRegex = /\s+/g;
      // All other characters (special signs, emojis, Hanja, Cyrillic, etc.)
      const otherRegex = /[^a-zA-Z0-9\s\uac00-\ud7a3]/g;

      // 1. Korean text token estimation (Hangul)
      // Hangul character sequence is tokenized heavily due to sub-syllable BPE dictionaries.
      // Typically, 1 Hangul character maps to 1.5 - 2.2 tokens. We use 1.8.
      const koreanMatch = text.match(koreanRegex);
      const koreanCount = koreanMatch ? koreanMatch.length : 0;
      tokens += koreanCount * 1.8;

      // 2. English text token estimation
      // English words average ~1.3 tokens per word. Long words are split.
      const englishMatch = text.match(englishWordRegex);
      if (englishMatch) {
        englishMatch.forEach(word => {
          if (word.length > 8) {
            tokens += Math.ceil(word.length / 4);
          } else {
            tokens += 1.25;
          }
        });
      }

      // 3. Whitespace token estimation
      // Every space or sequence of spaces typically represents a token boundary.
      const spaceMatch = text.match(whitespaceRegex);
      const spaceCount = spaceMatch ? spaceMatch.length : 0;
      tokens += spaceCount * 0.6;

      // 4. Special characters, punctuation, emojis
      const otherMatch = text.match(otherRegex);
      const otherCount = otherMatch ? otherMatch.length : 0;
      tokens += otherCount * 0.8;

      // Return rounded result, minimum of 1 for non-empty text
      return Math.max(1, Math.round(tokens));
    }
  };

  // Expose to window context
  if (typeof window !== 'undefined') {
    window.AicoTokenizer = AicoTokenizer;
  }
  
  // Node.js support for testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AicoTokenizer;
  }
})();
