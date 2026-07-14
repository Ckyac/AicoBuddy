// content.js - Injected Content Script for Simplified Carbon Tracker

(function() {
  if (window.AicoBuddyInjected) return;
  window.AicoBuddyInjected = true;

  // State Management
  let panelOpen = false;
  let activeElement = null;
  let lastProcessedText = '';
  let analysisDebounceTimer = null;
  let pendingLogData = null;

  // 1. Inject DOM Elements (Bubble and Panel)
  function injectUI() {
    // Bubble UI
    const bubble = document.createElement('div');
    bubble.className = 'aico-buddy-bubble';
    bubble.id = 'aico-buddy-bubble';
    bubble.title = 'AIco Buddy - AI 탄소 발자국 추적기';
    bubble.innerHTML = `
      <svg class="aico-bubble-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    `;
    document.body.appendChild(bubble);

    // Sliding Panel UI
    const panel = document.createElement('div');
    panel.className = 'aico-buddy-panel';
    panel.id = 'aico-buddy-panel';
    panel.innerHTML = `
      <div class="aico-panel-header">
        <div class="aico-header-title">
          <img src="${chrome.runtime.getURL('icons/icon128.png')}" alt="Logo" class="aico-header-logo">
          <h2>AIco Buddy 탄소 측정기</h2>
        </div>
        <button class="aico-close-btn" id="aico-close-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="aico-panel-content">
        <!-- Input Status / Welcome State -->
        <div id="aico-empty-state" class="aico-section-card" style="text-align: center; padding: 24px 12px;">
          <p class="aico-card-desc" style="color: #64748b;">채팅창에 질문을 입력하시면 이 대화로 인해 발생할 실시간 토큰 소모량과 탄소/수자원 발자국을 여기에 시각화해 드립니다. 🔌</p>
        </div>

        <div id="aico-active-state" style="display: none; display: flex; flex-direction: column; gap: 12px;">
          <!-- 1. Real-time carbon impact preview -->
          <div class="aico-section-card">
            <h3 class="aico-card-title">실시간 환경 발자국 예측</h3>
            <div class="aico-footprint-preview">
              <span class="aico-token-badge"><span id="aico-tokens-count">0</span> Tokens</span>
              <div class="aico-stats-row">
                <div class="aico-stat-box">
                  <span class="aico-stat-label">예상 탄소 배출</span>
                  <span class="aico-stat-num rose" id="aico-co2-val">0.00g</span>
                </div>
                <div class="aico-stat-box">
                  <span class="aico-stat-label">예상 냉각수 소비</span>
                  <span class="aico-stat-num rose" id="aico-water-val">0.0mL</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Equivalents details -->
          <div class="aico-section-card">
            <h3 class="aico-card-title">환경 영향 피해 수준 환산</h3>
            <div class="aico-equiv-grid">
              <div class="aico-equiv-box">
                <span>💡</span>
                <div class="aico-equiv-txt">
                  <span class="aico-equiv-num" id="aico-eq-bulb">0.0시간</span>
                  <span class="aico-equiv-lbl">LED 전구 작동 (9W)</span>
                </div>
              </div>
              <div class="aico-equiv-box">
                <span>🔋</span>
                <div class="aico-equiv-txt">
                  <span class="aico-equiv-num" id="aico-eq-phone">0.0회</span>
                  <span class="aico-equiv-lbl">스마트폰 완충</span>
                </div>
              </div>
              <div class="aico-equiv-box" style="grid-column: span 2;">
                <span>🌳</span>
                <div class="aico-equiv-txt">
                  <span class="aico-equiv-num" id="aico-eq-tree">0.00일</span>
                  <span class="aico-equiv-lbl">소나무 한 그루의 정화 소요 시간</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="aico-panel-footer">
        Aico Buddy • AI Carbon Footprint Tracker
      </div>
    `;
    document.body.appendChild(panel);

    // Event Bindings
    bubble.addEventListener('click', togglePanel);
    document.getElementById('aico-close-btn').addEventListener('click', () => togglePanel(false));
  }

  // Toggle panel visibility
  function togglePanel(forceState) {
    const panel = document.getElementById('aico-buddy-panel');
    panelOpen = typeof forceState === 'boolean' ? forceState : !panelOpen;
    
    if (panelOpen) {
      panel.classList.add('open');
      processTextInput();
    } else {
      panel.classList.remove('open');
    }
  }

  // Find active elements in modern chat websites
  function getActiveChatInput() {
    const active = document.activeElement;
    if (!active) return null;

    const isTextarea = active.tagName === 'TEXTAREA' || active.tagName === 'INPUT';
    const isContentEditable = active.getAttribute('contenteditable') === 'true';

    if (isTextarea || isContentEditable) {
      activeElement = active;
      return active;
    }
    return activeElement;
  }

  // Read text value from input element
  function getElementText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return el.value;
    }
    return el.innerText || '';
  }

  // Monitor text typing and process stats
  function handleInputEvent(e) {
    const target = e.target;
    const isInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.getAttribute('contenteditable') === 'true';
    if (!isInput) return;

    activeElement = target;

    clearTimeout(analysisDebounceTimer);
    analysisDebounceTimer = setTimeout(processTextInput, 300);
  }

  // Perform calculations and update sliding panel UI
  function processTextInput() {
    const inputEl = getActiveChatInput();
    if (!inputEl) return;

    const rawText = getElementText(inputEl);
    
    // Check if empty
    if (!rawText || rawText.trim().length === 0) {
      document.getElementById('aico-empty-state').style.display = 'block';
      document.getElementById('aico-active-state').style.display = 'none';
      lastProcessedText = '';
      pendingLogData = null;
      return;
    }

    if (rawText === lastProcessedText) return;
    lastProcessedText = rawText;

    // Transition state
    document.getElementById('aico-empty-state').style.display = 'none';
    document.getElementById('aico-active-state').style.display = 'flex';

    // 1. Estimate tokens
    const tokens = window.AicoTokenizer ? window.AicoTokenizer.countTokens(rawText) : Math.ceil(rawText.length / 3);
    document.getElementById('aico-tokens-count').innerText = tokens.toLocaleString();

    // 2. Environmental footprint calculation (Standard usage on LLM)
    const footprint = window.AicoAnalyzer ? window.AicoAnalyzer.calculateFootprint(tokens, 'llm') : { co2G: 0, waterMl: 0, energyWh: 0 };

    // Set preview numbers
    document.getElementById('aico-co2-val').innerText = `${footprint.co2G.toFixed(2)}g`;
    document.getElementById('aico-water-val').innerText = `${footprint.waterMl.toFixed(1)}mL`;

    // Set equivalents
    const equivalents = window.AicoAnalyzer ? window.AicoAnalyzer.getEquivalents(footprint.co2G, footprint.waterMl) : { ledBulbHours: 0, phoneCharges: 0, treeAbsorptionDays: 0 };
    document.getElementById('aico-eq-bulb').innerText = `${equivalents.ledBulbHours}시간`;
    document.getElementById('aico-eq-phone').innerText = `${equivalents.phoneCharges}회`;
    document.getElementById('aico-eq-tree').innerText = `${equivalents.treeAbsorptionDays}일`;

    // 3. Pre-calculate logging payload
    pendingLogData = {
      type: 'use',
      querySnippet: rawText.substring(0, 35) + (rawText.length > 35 ? '...' : ''),
      
      savedTokens: 0,
      savedEnergyWh: 0,
      savedCo2G: 0,
      savedWaterMl: 0,
      
      consumedTokens: tokens,
      consumedEnergyWh: footprint.energyWh,
      consumedCo2G: footprint.co2G,
      consumedWaterMl: footprint.waterMl
    };
  }

  // Intercepting Submit Events to log statistics
  function logCurrentQuery() {
    if (!pendingLogData) return;

    chrome.runtime.sendMessage({
      action: 'log_query',
      data: pendingLogData
    }, (response) => {
      if (response && response.success) {
        console.log('AIco Buddy query footprint logged successfully:', pendingLogData);
      }
    });

    // Reset session states after submission
    pendingLogData = null;
    lastProcessedText = '';
  }

  // Submission Listeners
  // Listen to Keydown events: User pressing Enter
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      setTimeout(() => {
        const inputEl = getActiveChatInput();
        if (inputEl) {
          const val = getElementText(inputEl);
          if (val === '') {
            logCurrentQuery();
          }
        }
      }, 50);
    }
  }, true);

  // Listen to Click events: User clicking "Send" buttons
  document.addEventListener('click', (e) => {
    let el = e.target;
    let isSendButton = false;

    while (el && el !== document.body) {
      const label = el.getAttribute('aria-label') || '';
      const testid = el.getAttribute('data-testid') || '';
      const className = el.className || '';

      if (
        testid.includes('send') || 
        testid.includes('submit') ||
        label.toLowerCase().includes('send') || 
        label.toLowerCase().includes('message') ||
        className.includes('send-button') ||
        el.tagName === 'BUTTON' && (el.innerText.toLowerCase().includes('전송') || el.innerText.toLowerCase().includes('보내기'))
      ) {
        isSendButton = true;
        break;
      }
      el = el.parentElement;
    }

    if (isSendButton) {
      setTimeout(() => {
        logCurrentQuery();
      }, 50);
    }
  }, true);

  // Event Listeners for tracking inputs
  document.addEventListener('input', handleInputEvent, true);
  document.addEventListener('keyup', handleInputEvent, true);
  document.addEventListener('focusin', handleInputEvent, true);

  // Initialize
  injectUI();
})();
