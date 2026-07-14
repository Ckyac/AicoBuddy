// popup.js - Controller for the Simplified Carbon Tracker Dashboard

document.addEventListener('DOMContentLoaded', () => {
  // Bind UI Elements
  const elConsumedCo2 = document.getElementById('consumed-co2');
  const elConsumedWater = document.getElementById('consumed-water');
  const elConsumedEnergy = document.getElementById('consumed-energy');
  const elConsumedTokens = document.getElementById('consumed-tokens');
  const elTotalQueries = document.getElementById('total-queries');

  const elEquivPhone = document.getElementById('equiv-phone');
  const elEquivBulb = document.getElementById('equiv-bulb');
  const elEquivTree = document.getElementById('equiv-tree');

  const btnReset = document.getElementById('btn-reset');
  const logsContainer = document.getElementById('logs-container');

  // Load and refresh stats
  function updateUI() {
    chrome.storage.local.get([
      'consumed_tokens',
      'consumed_energy_wh',
      'consumed_co2_g',
      'consumed_water_ml',
      'total_queries',
      'recent_logs'
    ], (result) => {
      const consumedCo2 = result.consumed_co2_g || 0;
      const consumedWater = result.consumed_water_ml || 0;
      const consumedEnergy = result.consumed_energy_wh || 0;
      const consumedTokens = result.consumed_tokens || 0;
      const totalQueries = result.total_queries || 0;

      // Update text values
      elConsumedCo2.innerText = consumedCo2.toFixed(2);
      elConsumedWater.innerText = consumedWater.toFixed(1);
      elConsumedEnergy.innerText = consumedEnergy.toFixed(2);
      elConsumedTokens.innerText = Math.round(consumedTokens).toLocaleString();
      elTotalQueries.innerText = totalQueries;

      // Update environmental equivalents
      // 1. Phone charge equivalent = 5g CO2
      elEquivPhone.innerText = (consumedCo2 / 5).toFixed(1);
      // 2. LED bulb (9W) active hours equivalent = 4.3g CO2
      elEquivBulb.innerText = (consumedCo2 / 4.3).toFixed(1);
      // 3. Number of trees daily absorption needed (1 tree daily absorption is ~60g CO2)
      elEquivTree.innerText = (consumedCo2 / 60).toFixed(2);

      // Render recent log history
      renderLogs(result.recent_logs || []);
    });
  }

  // Render recent activities
  function renderLogs(logs) {
    if (logs.length === 0) {
      logsContainer.innerHTML = '<div class="empty-log">최근 AI 사용 활동이 없습니다. ChatGPT, Gemini, Claude 등에서 질문하여 사용 발자국을 기록해 보세요.</div>';
      return;
    }

    logsContainer.innerHTML = '';
    logs.forEach(log => {
      const card = document.createElement('div');
      card.className = 'log-card';

      // Human readable time
      const timeStr = new Date(log.timestamp).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const preview = log.querySnippet ? `"${log.querySnippet}"` : 'AI 대화 실행';

      card.innerHTML = `
        <div class="log-card-header">
          <span class="log-badge">사용 발자국</span>
          <span class="log-time">${timeStr}</span>
        </div>
        <div class="log-query">${preview}</div>
        <div class="log-results">
          <span class="log-val">배출: ${log.consumedCo2G.toFixed(2)}g CO₂</span>
          <span>소비수: ${log.consumedWaterMl.toFixed(1)}mL (${log.consumedTokens}T)</span>
        </div>
      `;

      logsContainer.appendChild(card);
    });
  }

  // Reset stats event listener
  btnReset.addEventListener('click', () => {
    if (confirm('모든 누적 AI 환경 파괴 발자국 통계를 초기화하시겠습니까?')) {
      chrome.runtime.sendMessage({ action: 'reset_stats' }, (response) => {
        if (response && response.success) {
          updateUI();
        }
      });
    }
  });

  // Initial update
  updateUI();

  // Listen for storage updates in real-time
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      updateUI();
    }
  });
});
