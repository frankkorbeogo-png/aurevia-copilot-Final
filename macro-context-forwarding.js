export function buildMacroContextForAI(macroContext){
 return macroContext&&typeof macroContext==='object'
  ?macroContext
  :{configured:false,notice:'Contexte macro indisponible.'};
}
