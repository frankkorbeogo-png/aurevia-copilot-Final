export function validateMarketQuote(data,{maxFetchedAgeMs=45000,now=Date.now()}={}){
 if(!data||typeof data!=='object')return {ok:false,error:'Réponse de cotation invalide.'};
 if(data.stale===true)return {ok:false,error:'Le fournisseur est indisponible et le cours provient du cache ancien. Actualisez avant de continuer.'};
 const freshness=data.freshness||(data.stale===true?'stale':'recent');
 if(!['recent','last_close'].includes(freshness))return {ok:false,error:freshness==='unknown'?'Horodatage de dernière cotation absent : impossible de confirmer la fraîcheur du cours.':'Dernière cotation trop ancienne ou horodatage invalide.'};
 const asOf=Date.parse(data.asOf||data.quoteAt||'');
 const maxQuoteAge=freshness==='recent'?120000:7*24*60*60*1000;
 if(!Number.isFinite(asOf)||asOf>now+300000||now-asOf>maxQuoteAge)return {ok:false,error:'Dernière cotation hors de la fenêtre d’affichage autorisée.'};
 const fetchedAt=Date.parse(data.fetchedAt||'');
 const fetchedAge=now-fetchedAt;
 if(!Number.isFinite(fetchedAt)||fetchedAge<0||fetchedAge>maxFetchedAgeMs)return {ok:false,error:'Le cours reçu est trop ancien. Actualisez les cotations avant de continuer.'};
 const price=Number(data.price);
 if(!Number.isFinite(price)||price<=0)return {ok:false,error:'Prix de marché invalide.'};
 return {ok:true,price,asOf,fetchedAt,freshness,marketOpen:data.marketOpen===true,displayLabel:data.displayLabel|| (freshness==='recent'?'Cours récent':'Dernière clôture disponible')};
}
