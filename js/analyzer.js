/**
 * analyzer.js — CSV processing & statistics engine (local, no data sent to AI)
 * Uses PapaParse (loaded via CDN).
 */
const Analyzer = (() => {

  /**
   * Parse CSV and compute trading statistics.
   * @param {string} csvText - raw CSV string
   * @param {object} colMap  - { pnl: 'colName', price: 'colName', time: 'colName' }
   * @returns {object} stats summary
   */
  function processCSV(csvText, colMap) {
    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: true });
    if (!result.data.length) throw new Error('CSV is empty or could not be parsed.');

    const rows = result.data;
    const pnlCol   = colMap.pnl;
    const priceCol = colMap.price;
    const timeCol  = colMap.time;

    // Extract PnL values
    const pnls = rows
      .map(r => parseFloat(r[pnlCol]))
      .filter(v => !isNaN(v));

    if (!pnls.length) throw new Error(`Column "${pnlCol}" not found or has no numeric values.`);

    const totalPnL   = pnls.reduce((s, v) => s + v, 0);
    const wins       = pnls.filter(v => v > 0);
    const losses     = pnls.filter(v => v < 0);
    const winRate    = pnls.length ? (wins.length / pnls.length * 100) : 0;
    const worstTrade = Math.min(...pnls);
    const bestTrade  = Math.max(...pnls);
    const avgWin     = wins.length  ? wins.reduce((s,v)=>s+v,0)  / wins.length  : 0;
    const avgLoss    = losses.length? losses.reduce((s,v)=>s+v,0)/ losses.length: 0;
    const rrRatio    = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : null;

    // Max Drawdown (running equity curve)
    let peak = 0, equity = 0, maxDD = 0;
    for (const p of pnls) {
      equity += p;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
    }

    // Detect overtrading (>10 trades is a flag)
    const tradeCount = pnls.length;

    // Column names found in CSV (for mapping UI)
    const availableCols = result.meta.fields || [];

    return {
      availableCols,
      stats: {
        tradeCount,
        totalPnL:    +totalPnL.toFixed(2),
        winRate:     +winRate.toFixed(1),
        wins:        wins.length,
        losses:      losses.length,
        bestTrade:   +bestTrade.toFixed(2),
        worstTrade:  +worstTrade.toFixed(2),
        avgWin:      +avgWin.toFixed(2),
        avgLoss:     +avgLoss.toFixed(2),
        rrRatio:     rrRatio !== null ? +rrRatio.toFixed(2) : 'N/A',
        maxDrawdown: +maxDD.toFixed(2),
        overtrading: tradeCount > 10,
      }
    };
  }

  return { processCSV };
})();
