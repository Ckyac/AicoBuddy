// lib/analyzer.js - On-device prompt optimization and carbon analyzer

(function() {
  const AicoAnalyzer = {
    // Conversational fillers to strip during compression
    fillers: [
      // English fillers
      /\b(please|could you please|would you mind|can you|help me with|i want to know|tell me|explain to me)\b/gi,
      /\b(hello|hi|hey|good morning|good afternoon|good evening|greetings)\b/gi,
      /\b(thank you|thanks|thanks a lot|appreciate it)\b/gi,
      // Korean fillers
      /(안녕하세요|반갑습니다|안녕|헤이)/g,
      /(부탁드립니다|부탁해요|부탁해|알려주세요|알려줘|설명해주세요|가르쳐주세요)/g,
      /(죄송하지만|혹시|실례지만|바쁘시겠지만)/g,
      /(감사합니다|고맙습니다|감사해요|고마워)/g
    ],

    // Simple query keyword list
    simpleKeywords: [
      'translate', '번역', 'definition', '뜻', 'capital', '수도', 'synonym', '동의어',
      'how to spell', '철자', 'calculator', '계산기', 'weather', '날씨', 'convert', '변환',
      'greetings', '인사', 'formula', '공식', 'what is', '무엇인가요', 'who is', '누구인가요'
    ],

    // Complex query keywords indicating high reasoning needs
    complexKeywords: [
      'analyze', '분석', 'explain the difference', '차이점 설명', 'design', '설계', 'architecture', '아키텍처',
      'optimize', '최적화', 'debug', '디버그', 'troubleshoot', '해결', 'refactor', '리팩토링',
      'compare', '비교', 'why did', '왜', 'how to implement', '구현 방법', 'integrate', '통합'
    ],

    /**
     * Estimates query complexity and suggests appropriate routing.
     * @param {string} text 
     * @returns {Object} { complexity: 'simple'|'complex', score: number, reason: string, suggestion: string }
     */
    analyzeComplexity(text) {
      if (!text || text.trim().length === 0) {
        return { complexity: 'simple', score: 0, reason: '빈 텍스트', suggestion: '입력이 없습니다.' };
      }

      const cleanText = text.trim();
      const wordCount = cleanText.split(/\s+/).length;
      const charCount = cleanText.length;
      
      let score = 0; // Negative for simple, Positive for complex
      let simpleMatches = [];
      let complexMatches = [];

      // 1. Length heuristics
      if (charCount < 50 || wordCount < 8) {
        score -= 20; // Very short is highly likely simple
      } else if (charCount > 300 || wordCount > 50) {
        score += 25; // Long inputs are likely complex
      }

      // 2. Keyword checks
      this.simpleKeywords.forEach(kw => {
        if (cleanText.toLowerCase().includes(kw)) {
          score -= 10;
          simpleMatches.push(kw);
        }
      });

      this.complexKeywords.forEach(kw => {
        if (cleanText.toLowerCase().includes(kw)) {
          score += 15;
          complexMatches.push(kw);
        }
      });

      // 3. Code block detection (triple backticks are highly complex)
      if (cleanText.includes('```')) {
        score += 40;
      }

      // Final classification
      const complexity = score >= 5 ? 'complex' : 'simple';
      let reason = '';
      let suggestion = '';

      if (complexity === 'simple') {
        reason = `입력이 짧고 단순한 지식 확인이나 기본 요청 패턴입니다. (${simpleMatches.slice(0, 2).join(', ') || '짧은 쿼리'})`;
        suggestion = 'Gemini Flash 또는 GPT-4o-mini 같은 경량 소형 모델(SLM)을 사용해 탄소 배출을 90% 절약할 수 있습니다.';
      } else {
        reason = `상세한 문맥 파악, 깊은 분석 또는 코딩 추론이 필요한 문장 구조입니다. (${complexMatches.slice(0, 2).join(', ') || '긴 설명 구조'})`;
        suggestion = 'Gemini Pro 또는 GPT-4o 같은 거대 언어 모델(LLM)을 사용하기에 적합합니다.';
      }

      return { complexity, score, reason, suggestion };
    },

    /**
     * Compresses the prompt by stripping conversational filler words.
     * @param {string} text 
     * @returns {Object} { compressedText: string, originalTokens: number, compressedTokens: number, savedTokens: number, ratio: number }
     */
    compressPrompt(text) {
      if (!text) return { compressedText: '', originalTokens: 0, compressedTokens: 0, savedTokens: 0, ratio: 0 };
      
      const originalTokens = window.AicoTokenizer ? window.AicoTokenizer.countTokens(text) : Math.ceil(text.length / 3);
      
      let compressedText = text;

      // Apply regex fillers removal
      this.fillers.forEach(regex => {
        compressedText = compressedText.replace(regex, '');
      });

      // Remove multiple consecutive whitespaces/newlines and trim
      compressedText = compressedText.replace(/[ \t]+/g, ' ');
      compressedText = compressedText.replace(/\n\s*\n+/g, '\n');
      compressedText = compressedText.trim();

      // If compression resulted in empty string, revert to original text
      if (compressedText.length === 0) {
        compressedText = text.trim();
      }

      const compressedTokens = window.AicoTokenizer ? window.AicoTokenizer.countTokens(compressedText) : Math.ceil(compressedText.length / 3);
      const savedTokens = Math.max(0, originalTokens - compressedTokens);
      const ratio = originalTokens > 0 ? (savedTokens / originalTokens) * 100 : 0;

      return {
        compressedText,
        originalTokens,
        compressedTokens,
        savedTokens,
        ratio: Math.round(ratio)
      };
    },

    /**
     * Calculates the carbon and water footprint of a query.
     * @param {number} tokens - total tokens (input + estimated output)
     * @param {string} modelType - 'slm' (small) or 'llm' (large)
     * @returns {Object} { energyWh: number, co2G: number, waterMl: number }
     */
    calculateFootprint(tokens, modelType = 'llm') {
      // Academic assumptions:
      // Heavy LLM (e.g., GPT-4 / Gemini Ultra): 0.5 Wh base per request + 0.0002 Wh per token
      // Light SLM (e.g., GPT-4o-mini / Gemini Flash): 0.05 Wh base per request + 0.00002 Wh per token
      const baseWh = modelType === 'llm' ? 0.5 : 0.05;
      const perTokenWh = modelType === 'llm' ? 0.0002 : 0.00002;
      
      // Cooling water consumption:
      // Heavy LLM: 0.01 ml per token
      // Light SLM: 0.001 ml per token
      const waterPerTokenMl = modelType === 'llm' ? 0.01 : 0.001;

      const energyWh = baseWh + (tokens * perTokenWh);
      
      // Carbon intensity: global average is approx 475 g CO2 per kWh (0.475 g per Wh)
      const co2G = energyWh * 0.475;
      
      // Water consumption calculation
      const waterMl = tokens * waterPerTokenMl + (modelType === 'llm' ? 2 : 0.2); // Base water + token water

      return {
        energyWh: parseFloat(energyWh.toFixed(4)),
        co2G: parseFloat(co2G.toFixed(4)),
        waterMl: parseFloat(waterMl.toFixed(2))
      };
    },

    /**
     * Translates carbon grams and water milliliters into relatable environmental units.
     * @param {number} co2G 
     * @param {number} waterMl 
     * @returns {Object} equivalents
     */
    getEquivalents(co2G, waterMl) {
      return {
        // 1 full smartphone charge is about 5g CO2
        phoneCharges: parseFloat((co2G / 5).toFixed(1)),
        // 1 hour of a 9W LED bulb is about 4.3g CO2
        ledBulbHours: parseFloat((co2G / 4.3).toFixed(1)),
        // A single tree absorbs about 60g of CO2 per day (22kg per year)
        treeAbsorptionDays: parseFloat((co2G / 60).toFixed(2)),
        // 1 standard cup of water is 250ml
        waterCups: parseFloat((waterMl / 250).toFixed(1))
      };
    }
  };

  // Expose to window context
  if (typeof window !== 'undefined') {
    window.AicoAnalyzer = AicoAnalyzer;
  }

  // Node.js support
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AicoAnalyzer;
  }
})();
