export function validateMarketQuote(data,{maxFetchedAgeMs=45000,now=Date.now()}={}){
 if(!data||typeof data!=='object')return {ok:false,error:'Réponse de cotation invalide.'};
 if(data.stale===true)return {ok:false,error:'Le fournisseur est indisponible et le cours provient du cache ancien. Actualisez avant de continuer.'};
 if(data.freshness!=='recent')return {ok:false,error:data.freshness==='unknown'?'Horodatage de dernière cotation absent : impossible de confirmer la fraîcheur du cours.':'Dernière cotation trop ancienne ou horodatage invalide. Actualisez avant de continuer.'};
 const asOf=Date.parse(data.asOf||'');
 if(!Number.isFinite(asOf)||asOf>now+300000||now-asOf>120000)return {ok:false,error:'Dernière cotation hors de la fenêtre de fraîcheur autorisée.'};
 const fetchedAt=Date.parse(data.fetchedAt||'');
 const fetchedAge=now-fetchedAt;
 if(!Number.isFinite(fetchedAt)||fetchedAge<0||fetchedAge>maxFetchedAgeMs)return {ok:false,error:'Le cours reçu est trop ancien. Actualisez les cotations avant de continuer.'};
 const price=Number(data.price);
 if(!Number.isFinite(price)||price<=0)return {ok:false,error:'Prix de marché invalide.'};
 return {ok:true,price,asOf,fetchedAt};
}
