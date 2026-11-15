// Catalogue central des instruments AUREVIA.
// Seuls les instruments enabled:true sont autorisés par les flux et le moteur IA.
// Les instruments non confirmés chez le fournisseur restent visibles mais désactivés.
export const MARKET_INSTRUMENTS = Object.freeze({
  XAUUSD:{label:'XAU/USD',provider:'XAU/USD',tv:'OANDA:XAUUSD',category:'Métaux précieux',market:'METALS'},
  XAGUSD:{label:'XAG/USD',provider:'XAG/USD',tv:'OANDA:XAGUSD',category:'Métaux précieux',market:'METALS'},
  EURUSD:{label:'EUR/USD',provider:'EUR/USD',tv:'OANDA:EURUSD',category:'Forex majeur',market:'FOREX'},
  GBPUSD:{label:'GBP/USD',provider:'GBP/USD',tv:'OANDA:GBPUSD',category:'Forex majeur',market:'FOREX'},
  USDJPY:{label:'USD/JPY',provider:'USD/JPY',tv:'OANDA:USDJPY',category:'Forex majeur',market:'FOREX'},
  AUDUSD:{label:'AUD/USD',provider:'AUD/USD',tv:'OANDA:AUDUSD',category:'Forex majeur',market:'FOREX'},
  USDCAD:{label:'USD/CAD',provider:'USD/CAD',tv:'OANDA:USDCAD',category:'Forex majeur',market:'FOREX'},
  USDCHF:{label:'USD/CHF',provider:'USD/CHF',tv:'OANDA:USDCHF',category:'Forex majeur',market:'FOREX'},
  NZDUSD:{label:'NZD/USD',provider:'NZD/USD',tv:'OANDA:NZDUSD',category:'Forex majeur',market:'FOREX'},
  EURGBP:{label:'EUR/GBP',provider:'EUR/GBP',tv:'OANDA:EURGBP',category:'Forex croisé',market:'FOREX'},
  EURJPY:{label:'EUR/JPY',provider:'EUR/JPY',tv:'OANDA:EURJPY',category:'Forex croisé',market:'FOREX'},
  GBPJPY:{label:'GBP/JPY',provider:'GBP/JPY',tv:'OANDA:GBPJPY',category:'Forex croisé',market:'FOREX'},
  EURAUD:{label:'EUR/AUD',provider:'EUR/AUD',tv:'OANDA:EURAUD',category:'Forex croisé',market:'FOREX'},
  EURCHF:{label:'EUR/CHF',provider:'EUR/CHF',tv:'OANDA:EURCHF',category:'Forex croisé',market:'FOREX'},
  GBPAUD:{label:'GBP/AUD',provider:'GBP/AUD',tv:'OANDA:GBPAUD',category:'Forex croisé',market:'FOREX'},
  AUDJPY:{label:'AUD/JPY',provider:'AUD/JPY',tv:'OANDA:AUDJPY',category:'Forex croisé',market:'FOREX'},
  BTCUSD:{label:'BTC/USD',provider:'BTC/USD',tv:'BITSTAMP:BTCUSD',category:'Crypto',market:'CRYPTO'},
  ETHUSD:{label:'ETH/USD',provider:'ETH/USD',tv:'BITSTAMP:ETHUSD',category:'Crypto',market:'CRYPTO'},
  SOLUSD:{label:'SOL/USD',provider:'SOL/USD',tv:'COINBASE:SOLUSD',category:'Crypto',market:'CRYPTO'},
  XRPUSD:{label:'XRP/USD',provider:'XRP/USD',tv:'BITSTAMP:XRPUSD',category:'Crypto',market:'CRYPTO'},
  AAPL:{label:'AAPL',provider:'AAPL',tv:'NASDAQ:AAPL',category:'Actions US',market:'EQUITY'},
  MSFT:{label:'MSFT',provider:'MSFT',tv:'NASDAQ:MSFT',category:'Actions US',market:'EQUITY'},
  NVDA:{label:'NVDA',provider:'NVDA',tv:'NASDAQ:NVDA',category:'Actions US',market:'EQUITY'},
  TSLA:{label:'TSLA',provider:'TSLA',tv:'NASDAQ:TSLA',category:'Actions US',market:'EQUITY'},
  AMZN:{label:'AMZN',provider:'AMZN',tv:'NASDAQ:AMZN',category:'Actions US',market:'EQUITY'},
});
export const MARKET_ALL_IDS = Object.freeze(Object.keys(MARKET_INSTRUMENTS));
export const MARKET_IDS = Object.freeze(MARKET_ALL_IDS.filter(id=>MARKET_INSTRUMENTS[id].enabled!==false));
export const MARKET_PROVIDER_SYMBOLS = Object.freeze(MARKET_IDS.map(id=>MARKET_INSTRUMENTS[id].provider).filter(Boolean));
export const MARKET_LABELS = Object.freeze(MARKET_IDS.map(id=>MARKET_INSTRUMENTS[id].label));
export const getMarketInstrument = value => MARKET_INSTRUMENTS[String(value||'').toUpperCase()] || Object.values(MARKET_INSTRUMENTS).find(x=>x.provider&&x.provider===String(value||'').toUpperCase()||x.label===String(value||'').toUpperCase()) || null;
