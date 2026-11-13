import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../style.css',import.meta.url),'utf8');
test('le graphique principal ne s’initialise pas dans une page masquée',()=>{
  assert.match(app,/container\.getClientRects\(\)\.length>0&&container\.clientWidth>0&&container\.clientHeight>0/);
  assert.match(app,/Ouvrez l’espace Marchés pour initialiser le graphique/);
});
test('les montages TradingView concurrents sont annulés et les timers nettoyés',()=>{
  assert.match(app,/tradingViewMountToken/);
  assert.match(app,/clearInterval\(tradingViewRetryTimer\)/);
  assert.match(app,/token!==tradingViewMountToken/);
});
test('le widget principal utilise un conteneur interne dimensionné et autosize',()=>{
  assert.match(app,/id='tvChartWidgetMount'/);
  assert.match(app,/autosize:true/);
  assert.match(app,/container_id:mount\.id/);
  assert.match(app,/new ResizeObserver/);
});
test('les graphiques principaux et DXY restent adaptatifs en largeur',()=>{
  assert.match(css,/\.tv-chart\{[^}]*min-width:0/);
  assert.match(css,/\.tv-chart iframe\{[^}]*width:100%!important/);
  assert.match(css,/\.dxy-chart iframe\{[^}]*max-width:100%/);
  assert.match(html,/id="tvChart"/);
  assert.match(html,/id="dxyChart"/);
  assert.match(html,/id="dxyStandalone"/);
});
test('les unités de temps disponibles sont exposées au graphique principal',()=>{
  for(const tf of ['1','5','15','30','60','240','D'])assert.match(html,new RegExp(`data-tf="${tf}"`));
});
