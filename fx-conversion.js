const CURRENCY=/^[A-Z]{3}$/;
const SYMBOL_QUOTE_CURRENCY={US30:'USD',NAS100:'USD',SPX500:'USD',GER40:'EUR',UK100:'GBP',JPN225:'JPY',USOIL:'USD',UKOIL:'USD',AAPL:'USD',MSFT:'USD',NVDA:'USD',TSLA:'USD',AMZN:'USD',BTCUSD:'USD',ETHUSD:'USD',SOLUSD:'USD',XRPUSD:'USD'};
export function inferQuoteCurrency(instrument){
 const symbol=String(instrument||'').trim().toUpperCase().replace(/\s+/g,'');
 if(symbol.includes('/')){const parts=symbol.split('/');const quote=parts.at(-1);return CURRENCY.test(quote)?quote:null;}
 if(SYMBOL_QUOTE_CURRENCY[symbol])return SYMBOL_QUOTE_CURRENCY[symbol];
 if(/^[A-Z]{6}$/.test(symbol))return symbol.slice(3);
 if(/^[A-Z]{3,8}$/.test(symbol))return null;
 return null;
}
export function validateFxSnapshot(snapshot,{from,to}={}){
 if(!snapshot||snapshot.from!==from||snapshot.to!==to||!Number.isFinite(Number(snapshot.rate))||Number(snapshot.rate)<=0||!snapshot.fetchedAt||!snapshot.source)throw new Error(`Conversion ${from} → ${to} indisponible ou invalide. Le résultat financier n’a pas été calculé.`);
 return {from,to,rate:Number(snapshot.rate),fetchedAt:snapshot.fetchedAt,source:snapshot.source};
}
